import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { enforceSameOrigin } from "@/lib/security";
import { db } from "@/lib/db";
import { verifyCheckoutSignature, razorpayClient } from "@/lib/razorpay";
import { commitReservation } from "@/lib/inventory";
import { audit } from "@/lib/audit";
import { calculateRealizedContribution } from "@/lib/engines/accounting";
import { DEMO, gatewayFeeGstRecoverable } from "@/lib/config";

const schema = z.object({
  razorpay_payment_id: z.string().min(5).max(120),
  razorpay_order_id: z.string().min(5).max(120),
  razorpay_signature: z.string().regex(/^[a-f0-9]+$/i).max(256)
});

type CommerceOrder = { id:string; merchant_id:string; offer_id:string; razorpay_order_id:string; razorpay_payment_id:string|null; expected_amount_paise:number; currency:string; status:string };
type Offer = { id:string; intent_id:string; sku:string; qty:number; location_id:string; gross_amount_paise:number };
type Policy = { reservation_id:string };

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    const session = await requireApiSession();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid payment verification payload." }, { status: 400 });

    const order = db.prepare("SELECT * FROM commerce_orders WHERE razorpay_order_id=? AND merchant_id=?").get(parsed.data.razorpay_order_id, session.merchantId) as CommerceOrder | undefined;
    if (!order) return NextResponse.json({ error: "Unknown commerce order." }, { status: 404 });
    if (["PAID","PAID_REQUIRES_RECONCILIATION"].includes(order.status) && order.razorpay_payment_id === parsed.data.razorpay_payment_id) {
      return NextResponse.json({ ok: true, status: order.status, paymentId: order.razorpay_payment_id, orderId: order.razorpay_order_id, duplicate: true });
    }

    const sigOk = verifyCheckoutSignature({ storedOrderId: order.razorpay_order_id, paymentId: parsed.data.razorpay_payment_id, signature: parsed.data.razorpay_signature });
    if (!sigOk) {
      audit({ offerId: order.offer_id, eventType: "CHECKOUT_SIGNATURE_FAILED", actor: "PAYMENT_GATEWAY", severity: "BLOCK", detail: "Checkout callback HMAC did not match the server-stored Razorpay order id. No fulfilment transition occurred.", metadata: { commerceOrderId: order.id } });
      return NextResponse.json({ error: "Checkout signature verification failed." }, { status: 400 });
    }
    audit({ offerId: order.offer_id, eventType: "CHECKOUT_SIGNATURE_VERIFIED", actor: "PAYMENT_GATEWAY", severity: "SUCCESS", detail: "Checkout callback HMAC verified using the server-stored order id.", metadata: { commerceOrderId: order.id, razorpayPaymentId: parsed.data.razorpay_payment_id } });

    const client = razorpayClient();
    const payment = await client.payments.fetch(parsed.data.razorpay_payment_id) as unknown as { id:string; amount:number|string; currency:string; order_id:string; status:string; captured?:boolean; fee?:number|null; tax?:number|null; method?:string };
    const rpOrder = await client.orders.fetch(order.razorpay_order_id) as unknown as { id:string; amount:number|string; currency:string; status:string };
    const amountOk = Number(payment.amount) === order.expected_amount_paise && Number(rpOrder.amount) === order.expected_amount_paise;
    const currencyOk = String(payment.currency) === order.currency && String(rpOrder.currency) === order.currency;
    const relationshipOk = String(payment.order_id) === order.razorpay_order_id && String(rpOrder.id) === order.razorpay_order_id;
    const captured = payment.status === "captured" || payment.captured === true || rpOrder.status === "paid";
    audit({ offerId: order.offer_id, eventType: "PAYMENT_STATUS_FETCHED", actor: "PAYMENT_GATEWAY", severity: amountOk&&currencyOk&&relationshipOk&&captured ? "SUCCESS" : "BLOCK", detail: "Server fetched authoritative Razorpay payment/order state and compared it with the bound local order.", metadata: { amountOk, currencyOk, relationshipOk, paymentStatus: payment.status, orderStatus: rpOrder.status } });
    if (!amountOk || !currencyOk || !relationshipOk || !captured) {
      audit({ offerId: order.offer_id, eventType: "PAYMENT_STATUS_MISMATCH", actor: "PAYMENT_GATEWAY", severity: "BLOCK", detail: "Server-side Razorpay state did not match the authorized order invariant; fulfilment blocked.", metadata: { amountOk, currencyOk, relationshipOk, paymentStatus: payment.status, orderStatus: rpOrder.status } });
      return NextResponse.json({ error: "Payment state does not satisfy fulfilment invariants." }, { status: 409 });
    }

    const offer = db.prepare("SELECT * FROM offers WHERE id=? AND merchant_id=?").get(order.offer_id, session.merchantId) as Offer | undefined;
    const policy = db.prepare("SELECT reservation_id FROM policy_decisions WHERE offer_id=? AND merchant_id=?").get(order.offer_id, session.merchantId) as Policy | undefined;
    if (!offer || !policy) return NextResponse.json({ error: "Local order state incomplete." }, { status: 409 });

    const committed = commitReservation(policy.reservation_id);
    const status = committed ? "PAID" : "PAID_REQUIRES_RECONCILIATION";
    let realizedProcessorFeePaise: number | null = null;
    let realizedContributionPaise: number | null = null;
    let realizedContributionMargin: string | null = null;
    if (typeof payment.fee === "number" && typeof payment.tax === "number") {
      const location = db.prepare(`SELECT economic_fulfilment_cost_paise FROM fulfilment_locations WHERE merchant_id=? AND id=?`).get(session.merchantId, offer.location_id) as { economic_fulfilment_cost_paise:number } | undefined;
      const product = db.prepare(`SELECT economic_unit_cogs_paise FROM products WHERE merchant_id=? AND sku=?`).get(session.merchantId, offer.sku) as { economic_unit_cogs_paise:number } | undefined;
      if (location && product) {
        const realized = calculateRealizedContribution({
          grossCustomerPayablePaise: order.expected_amount_paise,
          outputGstRate: DEMO.outputGstRate,
          economicCogsPaise: product.economic_unit_cogs_paise * offer.qty,
          fulfilmentCostPaise: location.economic_fulfilment_cost_paise,
          processorFeeIncludingTaxPaise: payment.fee,
          processorTaxPaise: payment.tax,
          gatewayFeeGstRecoverable: gatewayFeeGstRecoverable()
        });
        realizedProcessorFeePaise = realized.processorCostPaise;
        realizedContributionPaise = realized.contributionPaise;
        realizedContributionMargin = realized.contributionMargin;
      }
    }

    const now = new Date().toISOString();
    db.prepare(`UPDATE commerce_orders SET razorpay_payment_id=?, status=?, realized_processor_fee_paise=?, realized_contribution_paise=?, realized_contribution_margin=?, updated_at=? WHERE id=?`)
      .run(payment.id, status, realizedProcessorFeePaise, realizedContributionPaise, realizedContributionMargin, now, order.id);
    if (committed) {
      db.prepare("UPDATE offers SET status='PAID' WHERE id=?").run(order.offer_id);
      db.prepare("UPDATE buyer_intents SET state='PAID', lifecycle='RECOVERED_AND_PAID' WHERE id=?").run(offer.intent_id);
    }
    audit({ intentId: offer.intent_id, offerId: offer.id, eventType: committed ? "PAYMENT_CAPTURED" : "PAID_REQUIRES_RECONCILIATION", actor: "PAYMENT_GATEWAY", severity: committed ? "SUCCESS" : "WARN", detail: committed ? "Payment captured and server-side invariants verified. Inventory reservation committed." : "Payment captured after inventory reservation could no longer be committed; fulfilment requires reconciliation.", metadata: { razorpayPaymentId: payment.id, razorpayOrderId: order.razorpay_order_id, amountPaise: order.expected_amount_paise, status, paymentMethod: payment.method ?? null, realizedProcessorFeePaise, realizedContributionPaise, realizedContributionMargin } });
    return NextResponse.json({ ok: true, status, paymentId: payment.id, orderId: order.razorpay_order_id, realized: realizedContributionPaise === null ? null : { processorFeePaise: realizedProcessorFeePaise, contributionPaise: realizedContributionPaise, contributionMargin: realizedContributionMargin } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Payment verification failed." }, { status: 400 });
  }
}
