import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/security";
import { verifyWebhookSignature } from "@/lib/razorpay";
import { commitReservation } from "@/lib/inventory";
import { audit } from "@/lib/audit";
import { commitSupplierReservation, getProcurementRun } from "@/lib/procurement";

export const runtime = "nodejs";

type WebhookPayload = {
  event?: string;
  payload?: {
    payment?: { entity?: { id?:string; order_id?:string; amount?:number; currency?:string; status?:string } };
    order?: { entity?: { id?:string; amount?:number; currency?:string; status?:string } };
  };
};

function reconcileCaptured(payload: WebhookPayload) {
  const payment = payload.payload?.payment?.entity;
  const orderEntity = payload.payload?.order?.entity;
  const razorpayOrderId = payment?.order_id || orderEntity?.id;
  if (!razorpayOrderId) return;
  const local = db.prepare("SELECT * FROM commerce_orders WHERE razorpay_order_id=?").get(String(razorpayOrderId)) as { id:string; offer_id:string; status:string; expected_amount_paise:number; currency:string; razorpay_payment_id:string|null } | undefined;
  if (!local || local.status === "PAID") return;

  const entityAmount = payment?.amount ?? orderEntity?.amount;
  const entityCurrency = payment?.currency ?? orderEntity?.currency;
  if (Number(entityAmount) !== local.expected_amount_paise || String(entityCurrency) !== local.currency) {
    audit({ offerId: local.offer_id, eventType: "WEBHOOK_PAYMENT_MISMATCH", actor: "RAZORPAY_WEBHOOK", severity: "BLOCK", detail: "Signed webhook amount/currency did not match the authorized commerce order. No fulfilment transition occurred.", metadata: { razorpayOrderId, entityAmount, entityCurrency } });
    return;
  }

  const policy = db.prepare("SELECT reservation_id FROM policy_decisions WHERE offer_id=?").get(local.offer_id) as { reservation_id:string } | undefined;
  const offer = db.prepare("SELECT intent_id FROM offers WHERE id=?").get(local.offer_id) as { intent_id:string } | undefined;
  if (!policy || !offer) return;
  const committed = commitReservation(policy.reservation_id);
  const status = committed ? "PAID" : "PAID_REQUIRES_RECONCILIATION";
  const paymentId = payment?.id ? String(payment.id) : local.razorpay_payment_id;
  const now = new Date().toISOString();
  db.prepare("UPDATE commerce_orders SET razorpay_payment_id=COALESCE(?, razorpay_payment_id), status=?, updated_at=? WHERE id=? AND status <> 'PAID'")
    .run(paymentId ?? null, status, now, local.id);
  if (committed) {
    db.prepare("UPDATE offers SET status='PAID' WHERE id=?").run(local.offer_id);
    db.prepare("UPDATE buyer_intents SET state='PAID', lifecycle='RECOVERED_AND_PAID' WHERE id=?").run(offer.intent_id);
  }
  audit({ intentId: offer.intent_id, offerId: local.offer_id, eventType: committed ? "WEBHOOK_PAYMENT_CAPTURED" : "WEBHOOK_RECONCILIATION_REQUIRED", actor: "RAZORPAY_WEBHOOK", severity: committed ? "SUCCESS" : "WARN", detail: committed ? "Signed webhook confirmed captured/paid state and committed the active reservation." : "Signed webhook confirmed payment, but the reservation could not be committed; fulfilment remains blocked for reconciliation.", metadata: { razorpayOrderId, paymentId, status } });
}


function reconcileProcurementCaptured(payload: WebhookPayload) {
  const payment = payload.payload?.payment?.entity;
  const orderEntity = payload.payload?.order?.entity;
  const razorpayOrderId = payment?.order_id || orderEntity?.id;
  if (!razorpayOrderId) return false;
  const local = db.prepare("SELECT * FROM procurement_orders WHERE razorpay_order_id=?").get(String(razorpayOrderId)) as { id:string; merchant_id:string; run_id:string; reservation_id:string; status:string; expected_amount_paise:number; currency:string; razorpay_payment_id:string|null } | undefined;
  if (!local || local.status === "PAID") return Boolean(local);
  const entityAmount = payment?.amount ?? orderEntity?.amount;
  const entityCurrency = payment?.currency ?? orderEntity?.currency;
  if (Number(entityAmount) !== local.expected_amount_paise || String(entityCurrency) !== local.currency) {
    audit({ eventType:"PROCUREMENT_WEBHOOK_PAYMENT_MISMATCH", actor:"RAZORPAY_WEBHOOK", severity:"BLOCK", detail:"Signed webhook amount/currency did not match the server-bound procurement order.", metadata:{ razorpayOrderId, entityAmount, entityCurrency, runId:local.run_id } });
    return true;
  }
  const committed = commitSupplierReservation(local.reservation_id);
  const status = committed ? "PAID" : "RECONCILIATION_REQUIRED";
  const paymentId = payment?.id ? String(payment.id) : local.razorpay_payment_id;
  const now = new Date().toISOString();
  db.prepare("UPDATE procurement_orders SET razorpay_payment_id=COALESCE(?,razorpay_payment_id),status=?,updated_at=? WHERE id=? AND status<>'PAID'").run(paymentId ?? null,status,now,local.id);
  db.prepare("UPDATE procurement_runs SET status=? WHERE id=?").run(status,local.run_id);
  if (committed) {
    const loaded = getProcurementRun(local.run_id, local.merchant_id);
    if (loaded?.selected) {
      const already = db.prepare("SELECT id FROM retailer_purchase_lines WHERE id=?").get(`paid_${paymentId}`);
      if (!already && paymentId) db.prepare(`INSERT INTO retailer_purchase_lines(id,merchant_id,source,supplier_name,purchased_at,product_key,product_name,brand,pack,quantity,gross_line_paise,gst_rate,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(`paid_${paymentId}`,local.merchant_id,'RAZORPAY_TEST_MODE',loaded.selected.supplierName,new Date().toISOString().slice(0,10),String(loaded.run.product_key),loaded.selected.listingTitle,'','',Number(loaded.run.cases),local.expected_amount_paise,'0',now);
    }
  }
  audit({ eventType:committed?"PROCUREMENT_WEBHOOK_PAYMENT_CAPTURED":"PROCUREMENT_WEBHOOK_RECONCILIATION_REQUIRED", actor:"RAZORPAY_WEBHOOK", severity:committed?"SUCCESS":"WARN", detail:committed?"Signed Razorpay webhook committed connected-supplier inventory and closed the procurement purchase.":"Signed webhook confirmed payment but supplier inventory requires reconciliation.", metadata:{ razorpayOrderId,paymentId,status,runId:local.run_id } });
  return true;
}
export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-razorpay-signature");
  const eventId = request.headers.get("x-razorpay-event-id");
  if (!signature || !eventId) return NextResponse.json({ error: "Missing webhook authentication headers." }, { status: 400 });

  audit({ eventType: "WEBHOOK_RECEIVED", actor: "RAZORPAY_WEBHOOK", severity: "INFO", detail: "Webhook received; body remains untrusted until HMAC verification succeeds.", metadata: { eventId } });
  try {
    if (!verifyWebhookSignature(rawBody, signature)) {
      audit({ eventType: "WEBHOOK_SIGNATURE_FAILED", actor: "RAZORPAY_WEBHOOK", severity: "BLOCK", detail: "Webhook HMAC verification failed; payload was not processed.", metadata: { eventId } });
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
    }
    audit({ eventType: "WEBHOOK_VERIFIED", actor: "RAZORPAY_WEBHOOK", severity: "SUCCESS", detail: "Raw-body webhook HMAC verified before JSON processing.", metadata: { eventId } });
    const existing = db.prepare("SELECT event_id FROM payment_events WHERE event_id=?").get(eventId);
    if (existing) {
      audit({ eventType: "WEBHOOK_DUPLICATE", actor: "RAZORPAY_WEBHOOK", severity: "INFO", detail: "Duplicate at-least-once webhook delivery ignored using x-razorpay-event-id.", metadata: { eventId } });
      return NextResponse.json({ ok: true, duplicate: true });
    }
    const payload = JSON.parse(rawBody) as WebhookPayload;
    db.prepare("INSERT INTO payment_events (event_id, event_type, payload_hash, created_at) VALUES (?, ?, ?, ?)")
      .run(eventId, payload.event ?? "unknown", sha256(rawBody), new Date().toISOString());

    // Reconciliation is intentionally bounded to local DB work so this endpoint can acknowledge within Razorpay's timeout budget.
    if (payload.event === "payment.captured" || payload.event === "order.paid") {
      const handledProcurement = reconcileProcurementCaptured(payload);
      if (!handledProcurement) reconcileCaptured(payload);
    }
    if (payload.event === "payment.failed") {
      const orderId = payload.payload?.payment?.entity?.order_id;
      if (orderId) {
        const now = new Date().toISOString();
        db.prepare("UPDATE commerce_orders SET status='PAYMENT_FAILED', updated_at=? WHERE razorpay_order_id=? AND status <> 'PAID'").run(now, String(orderId));
        db.prepare("UPDATE procurement_orders SET status='PAYMENT_FAILED', updated_at=? WHERE razorpay_order_id=? AND status <> 'PAID'").run(now, String(orderId));
      }
      audit({ eventType: "PAYMENT_FAILED", actor: "RAZORPAY_WEBHOOK", severity: "WARN", detail: "Signed payment.failed event persisted. Inventory remains controlled by reservation TTL so the buyer can retry safely.", metadata: { eventId, razorpayOrderId: orderId ?? null } });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Webhook rejected." }, { status: 400 });
  }
}
