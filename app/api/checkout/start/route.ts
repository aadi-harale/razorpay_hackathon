import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { DEMO } from "@/lib/config";
import { enforceSameOrigin } from "@/lib/security";
import { razorpayClient } from "@/lib/razorpay";
import { audit } from "@/lib/audit";
import { currentGstCapability, loadDemoFscCertificate } from "@/lib/engines/evidence";
import { hashOffer } from "@/lib/offers";

const schema = z.object({ offerId: z.string().min(5).max(120) });

type OfferRow = {
  id:string; merchant_id:string; intent_id:string; sku:string; qty:number; location_id:string; gross_amount_paise:number; currency:string; contribution_margin:string; offer_hash:string; expires_at:string; status:string;
};
type PolicyRow = {
  offer_id:string; offer_hash:string; reservation_id:string; exact_amount_paise:number; currency:string; fulfilment_location:string; contribution_margin:string; margin_floor:string; tax_snapshot:string; fee_policy_version:string; expires_at:string; result:string;
};
type ReservationRow = { id:string; merchant_id:string; sku:string; location_id:string; qty:number; offer_id:string; expires_at:string; status:string };
type CommerceOrderRow = { id:string; razorpay_order_id:string|null; expected_amount_paise:number; currency:string; status:string; created_at:string };


function validateBinding(offer: OfferRow, policy: PolicyRow, reservation: ReservationRow) {
  if (policy.result !== "ALLOW") throw new Error("POLICY_NOT_ALLOWED");
  if (policy.offer_hash !== offer.offer_hash || policy.exact_amount_paise !== offer.gross_amount_paise || policy.currency !== offer.currency || policy.fulfilment_location !== offer.location_id || policy.contribution_margin !== offer.contribution_margin) throw new Error("POLICY_OFFER_BINDING_MISMATCH");
  if (policy.margin_floor !== DEMO.contributionFloor || policy.fee_policy_version !== "b2b-corporate-card-3pct-v1") throw new Error("POLICY_VERSION_MISMATCH");
  if (new Date(policy.expires_at) <= new Date()) throw new Error("POLICY_EXPIRED");
  if (reservation.status !== "ACTIVE" || new Date(reservation.expires_at) <= new Date()) throw new Error("RESERVATION_NOT_ACTIVE");
  if (reservation.id !== policy.reservation_id || reservation.offer_id !== offer.id || reservation.merchant_id !== offer.merchant_id || reservation.sku !== offer.sku || reservation.location_id !== offer.location_id || reservation.qty !== offer.qty) throw new Error("RESERVATION_OFFER_BINDING_MISMATCH");
  const tax = JSON.parse(policy.tax_snapshot) as { outputGstRate?: string; inputGstRecoverable?: boolean; gatewayGstRecoverable?: boolean };
  if (tax.outputGstRate !== DEMO.outputGstRate || tax.inputGstRecoverable !== true) throw new Error("TAX_SNAPSHOT_INVALID");
}

function assertCurrentAuthority(offer: OfferRow) {
  const gst = currentGstCapability();
  const fsc = loadDemoFscCertificate();
  if (gst.status !== "VERIFIED_CURRENT" || fsc.status !== "VERIFIED_CURRENT") throw new Error("HARD_EVIDENCE_NO_LONGER_CURRENT");
  const product = db.prepare(`SELECT cost_status, cost_updated_at, economic_unit_cogs_paise FROM products WHERE merchant_id=? AND sku=?`).get(offer.merchant_id, offer.sku) as { cost_status:string; cost_updated_at:string; economic_unit_cogs_paise:number } | undefined;
  if (!product || product.cost_status !== "VERIFIED_CURRENT") throw new Error("COST_DATA_NOT_VERIFIED_CURRENT");
  const ageMs = Date.now() - new Date(product.cost_updated_at).getTime();
  if (!Number.isFinite(ageMs) || ageMs > 30 * 24 * 60 * 60 * 1000) throw new Error("COST_DATA_STALE");
  if (product.economic_unit_cogs_paise <= 0) throw new Error("COST_DATA_IMPLAUSIBLE");
}

function claimCommerceOrder(merchantId:string, offer:OfferRow) {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const existing = db.prepare("SELECT * FROM commerce_orders WHERE offer_id=? AND merchant_id=?").get(offer.id, merchantId) as CommerceOrderRow | undefined;
    if (existing?.razorpay_order_id) return { kind:"EXISTING" as const, row:existing };
    if (existing) {
      if (existing.status !== "CREATE_FAILED") return { kind:"IN_PROGRESS" as const, row:existing };
      db.prepare("UPDATE commerce_orders SET status='CREATING', last_error=NULL, updated_at=? WHERE id=? AND status='CREATE_FAILED'").run(now, existing.id);
      return { kind:"CLAIMED" as const, id:existing.id };
    }
    const id = `co_${randomUUID()}`;
    db.prepare(`INSERT INTO commerce_orders (id, merchant_id, offer_id, razorpay_order_id, expected_amount_paise, currency, status, created_at, updated_at)
      VALUES (?, ?, ?, NULL, ?, ?, 'CREATING', ?, ?)`)
      .run(id, merchantId, offer.id, offer.gross_amount_paise, offer.currency, now, now);
    return { kind:"CLAIMED" as const, id };
  });
  return tx();
}

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    const session = await requireApiSession();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid offer." }, { status: 400 });

    const offer = db.prepare("SELECT * FROM offers WHERE id=? AND merchant_id=?").get(parsed.data.offerId, session.merchantId) as OfferRow | undefined;
    if (!offer || !["APPROVED", "CHECKOUT_STARTED"].includes(offer.status)) return NextResponse.json({ error: "Offer is not eligible for checkout." }, { status: 409 });
    if (new Date(offer.expires_at) <= new Date()) return NextResponse.json({ error: "Offer expired." }, { status: 409 });
    if (hashOffer({ merchantId:offer.merchant_id, intentId:offer.intent_id, sku:offer.sku, qty:offer.qty, locationId:offer.location_id, grossAmountPaise:offer.gross_amount_paise, currency:offer.currency, contributionMargin:offer.contribution_margin }) !== offer.offer_hash) return NextResponse.json({ error: "Offer integrity check failed." }, { status: 409 });

    const policy = db.prepare("SELECT * FROM policy_decisions WHERE offer_id=? AND merchant_id=?").get(offer.id, session.merchantId) as PolicyRow | undefined;
    if (!policy) return NextResponse.json({ error: "Policy authorization missing." }, { status: 409 });
    const reservation = db.prepare("SELECT * FROM inventory_reservations WHERE id=? AND merchant_id=?").get(policy.reservation_id, session.merchantId) as ReservationRow | undefined;
    if (!reservation) return NextResponse.json({ error: "Inventory reservation missing." }, { status: 409 });
    validateBinding(offer, policy, reservation);
    assertCurrentAuthority(offer);

    const claim = claimCommerceOrder(session.merchantId, offer);
    if (claim.kind === "EXISTING") {
      return NextResponse.json({ keyId: process.env.RAZORPAY_KEY_ID, orderId: claim.row.razorpay_order_id, amount: claim.row.expected_amount_paise, currency: claim.row.currency, commerceOrderId: claim.row.id, idempotentReplay: true });
    }
    if (claim.kind === "IN_PROGRESS") return NextResponse.json({ error: "Checkout order creation is already in progress. Retry shortly; no second Razorpay order will be created." }, { status: 409 });

    try {
      const client = razorpayClient();
      const rpOrder = await client.orders.create({
        amount: offer.gross_amount_paise,
        currency: offer.currency,
        receipt: claim.id.slice(0, 40),
        notes: { commerce_order_id: claim.id, offer_id: offer.id, environment: "test" }
      });
      const now = new Date().toISOString();
      const update = db.prepare(`UPDATE commerce_orders SET razorpay_order_id=?, status='CREATED', updated_at=? WHERE id=? AND status='CREATING' AND razorpay_order_id IS NULL`)
        .run(String(rpOrder.id), now, claim.id);
      if (update.changes !== 1) throw new Error("LOCAL_ORDER_BINDING_FAILED_AFTER_GATEWAY_CREATE");
      db.prepare("UPDATE offers SET status='CHECKOUT_STARTED' WHERE id=?").run(offer.id);
      audit({ intentId: offer.intent_id, offerId: offer.id, eventType: "RAZORPAY_ORDER_CREATED", actor: "PAYMENT_GATEWAY", severity: "SUCCESS", detail: "Razorpay Test Mode order created from the server-bound approved offer.", metadata: { razorpayOrderId: rpOrder.id, commerceOrderId: claim.id, amountPaise: offer.gross_amount_paise, currency: offer.currency } });
      return NextResponse.json({ keyId: process.env.RAZORPAY_KEY_ID, orderId: rpOrder.id, amount: offer.gross_amount_paise, currency: offer.currency, commerceOrderId: claim.id });
    } catch (gatewayError) {
      const message = gatewayError instanceof Error ? gatewayError.message : "RAZORPAY_ORDER_CREATE_FAILED";
      db.prepare("UPDATE commerce_orders SET status='CREATE_FAILED', last_error=?, updated_at=? WHERE id=? AND razorpay_order_id IS NULL").run(message.slice(0,500), new Date().toISOString(), claim.id);
      throw gatewayError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Checkout start failed.";
    const status = message.includes("UNAUTHORIZED") ? 401 : message.includes("EXPIRED") || message.includes("BINDING") || message.includes("EVIDENCE") || message.includes("COST") ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
