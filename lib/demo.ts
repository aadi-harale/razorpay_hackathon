import { randomUUID } from "node:crypto";
import { db, resetInventory } from "@/lib/db";
import { DEMO } from "@/lib/config";
import { audit } from "@/lib/audit";
import { buildCandidates } from "@/lib/engines/rescue";
import { formatINR, percent } from "@/lib/engines/accounting";
import { currentGstCapability, loadDemoFscCertificate } from "@/lib/engines/evidence";
import { canProceed, hardEvidenceConstraint } from "@/lib/engines/constraints";
import { reserveInventory, inventorySnapshot } from "@/lib/inventory";
import type { DemoStep, EvidenceFact } from "@/lib/types";
import { safeJson } from "@/lib/security";
import { hashOffer } from "@/lib/offers";

function id(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}


export function resetDemoState() {
  const tx = db.transaction(() => {
    for (const table of [
      "commerce_orders",
      "policy_decisions",
      "inventory_reservations",
      "offers",
      "buyer_intents"
    ]) db.prepare(`DELETE FROM ${table}`).run();
  });
  tx();
  resetInventory();
}

function saveEvidence(fact: EvidenceFact) {
  db.prepare(`
    INSERT INTO evidence_facts
    (id, merchant_id, predicate, status, evidence_class, source, detail, valid_from, valid_until, scope, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id("fact"), DEMO.merchantId, fact.predicate, fact.status, fact.evidenceClass, fact.source, fact.detail,
    fact.validFrom ?? null, fact.validUntil ?? null, fact.scope ?? null, new Date().toISOString()
  );
}

export function runFlagshipDemo() {
  resetDemoState();
  const intentId = id("intent");
  const now = new Date();
  const rawIntent = "Buy 20 FSC-certified corporate gift boxes under ₹8,000, deliver to Pune by Monday, GST invoice required.";
  const steps: DemoStep[] = [];
  const push = (event: string, title: string, detail: string, state: DemoStep["state"], metadata: Record<string, unknown> = {}) => {
    const row = audit({ intentId, eventType: event, actor: event.startsWith("PAYMENT") ? "RAZORPAY" : "SHADOWFUNNEL", severity: state === "danger" ? "BLOCK" : state === "warning" ? "WARN" : state === "success" ? "SUCCESS" : "INFO", detail, metadata });
    steps.push({ id: row.id, event, title, detail, state, timestamp: row.createdAt });
  };

  db.prepare(`INSERT INTO buyer_intents (id, merchant_id, raw_text, state, lifecycle, represented_gmv_paise, created_at) VALUES (?, ?, ?, 'ACTIVE', 'REJECTED_UNRECOVERED', ?, ?)`)
    .run(intentId, DEMO.merchantId, rawIntent, DEMO.buyerBudgetGrossPaise, now.toISOString());

  push("AGENT_QUERY_RECEIVED", "Agent query received", "Buyer contacted the merchant commerce surface. This is the observable-funnel boundary.", "neutral");
  push("INTENT_PARSED", "Buyer mandate parsed", "20 units · final payable ≤ ₹8,000 · Pune by Monday · GST invoice HARD · FSC HARD", "success");

  const gst = currentGstCapability();
  saveEvidence(gst);
  const initialFsc = hardEvidenceConstraint("FSC certified", "FSC_CERTIFIED", null);
  push("HARD_CONSTRAINT_EVALUATED", "GST capability verified", "Current merchant tax configuration confirms GST registration and invoice generation are enabled.", "success", { source: gst.source });
  push("FSC_EVIDENCE_PENDING", "FSC certification unresolved", initialFsc.detail, "warning");

  const fsc = loadDemoFscCertificate(now);
  saveEvidence(fsc);
  const constraints = [
    hardEvidenceConstraint("GST invoice", "GST_INVOICE_AVAILABLE", gst),
    hardEvidenceConstraint("FSC certified", "FSC_CERTIFIED", fsc)
  ];
  push("FSC_CERTIFICATE_VERIFIED", "FSC certificate verified", `${fsc.source} is in-scope and valid ${fsc.validFrom} → ${fsc.validUntil}.`, "success", { evidenceClass: fsc.evidenceClass, source: fsc.source });
  if (!canProceed(constraints)) throw new Error("DEMO_CONSTRAINT_SETUP_INVALID");

  const candidates = buildCandidates();
  const baselineOverage = candidates.baseline.accounting.grossCustomerPayablePaise - DEMO.buyerBudgetGrossPaise;
  push("BASELINE_OFFER_REJECTED", "Default route misses buyer budget", `Central fulfilment is merchant-safe, but final payable is ${formatINR(candidates.baseline.accounting.grossCustomerPayablePaise)} — ${formatINR(baselineOverage)} above the buyer mandate.`, "warning", { candidateId: candidates.baseline.id, gross: candidates.baseline.accounting.grossCustomerPayablePaise });
  push("RESCUE_PLANNER_STARTED", "Rescue planner started", "Planner tests the smallest discount first, then topology changes. Rules rank candidates; no LLM authorizes money.", "neutral");
  push("MINIMUM_DISCOUNT_BLOCKED", "Minimum viable discount blocked", `${(candidates.minBps / 100).toFixed(4)}% reaches ${formatINR(candidates.minimumDiscount.accounting.grossCustomerPayablePaise)}, but contribution margin is ${percent(candidates.minimumDiscount.accounting.contributionMargin)} < ${percent(DEMO.contributionFloor)}.`, "danger", { candidateId: candidates.minimumDiscount.id });
  push("CANDIDATE_MARGIN_BLOCKED", "3% discount blocked", `Buyer would pay ${formatINR(candidates.threePercent.accounting.grossCustomerPayablePaise)}, but contribution margin is ${percent(candidates.threePercent.accounting.contributionMargin)} < ${percent(DEMO.contributionFloor)}.`, "danger", { candidateId: candidates.threePercent.id });
  push("LOCAL_ROUTE_SELECTED", "Pune edge route discovered", `Local fulfilment changes underlying merchant cost from ${formatINR(DEMO.locations.central.fulfilmentCostPaise)} to ${formatINR(DEMO.locations.edge.fulfilmentCostPaise)}; it is not a disguised discount.`, "success", { locationId: DEMO.locations.edge.id });
  push("POLICY_DECISION_ALLOWED", "Economically safe offer", `Buyer pays ${formatINR(candidates.edge.accounting.grossCustomerPayablePaise)} and projected contribution margin is ${percent(candidates.edge.accounting.contributionMargin)} ≥ ${percent(DEMO.contributionFloor)}.`, "success", { candidateId: candidates.edge.id });

  const offerId = id("offer");
  const offerPayload = {
    merchantId: DEMO.merchantId,
    intentId,
    sku: DEMO.sku,
    qty: DEMO.quantity,
    locationId: DEMO.locations.edge.id,
    grossAmountPaise: candidates.edge.accounting.grossCustomerPayablePaise,
    currency: DEMO.currency,
    contributionMargin: candidates.edge.accounting.contributionMargin
  };
  const offerHash = hashOffer(offerPayload);
  const expiresAt = new Date(Date.now() + DEMO.reservationTtlSeconds * 1000).toISOString();
  db.prepare(`INSERT INTO offers (id, merchant_id, intent_id, sku, qty, location_id, gross_amount_paise, currency, contribution_margin, offer_hash, expires_at, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?)`)
    .run(offerId, DEMO.merchantId, intentId, DEMO.sku, DEMO.quantity, DEMO.locations.edge.id, candidates.edge.accounting.grossCustomerPayablePaise, DEMO.currency, candidates.edge.accounting.contributionMargin, offerHash, expiresAt, new Date().toISOString());

  const reservation = reserveInventory({ offerId, sku: DEMO.sku, locationId: DEMO.locations.edge.id, qty: DEMO.quantity });
  if (!reservation) throw new Error("DEMO_RESERVATION_FAILED");
  push("INVENTORY_RESERVED", "Inventory reserved atomically", `20 units reserved at ${DEMO.locations.edge.id}. Reservation expires if checkout is abandoned.`, "success", { reservationId: reservation.id });

  const policyId = id("policy");
  db.prepare(`INSERT INTO policy_decisions (id, merchant_id, offer_id, offer_hash, reservation_id, exact_amount_paise, currency, fulfilment_location, contribution_margin, margin_floor, tax_snapshot, fee_policy_version, expires_at, result, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ALLOW', ?)`)
    .run(policyId, DEMO.merchantId, offerId, offerHash, reservation.id, candidates.edge.accounting.grossCustomerPayablePaise, DEMO.currency, DEMO.locations.edge.id, candidates.edge.accounting.contributionMargin, DEMO.contributionFloor, safeJson({ outputGstRate: DEMO.outputGstRate, inputGstRecoverable: true, gatewayGstRecoverable: true }), "b2b-corporate-card-3pct-v1", expiresAt, new Date().toISOString());

  push("OFFER_READY", "Offer safely bound", "Offer hash, exact amount, route, reservation, tax snapshot and fee-policy version are bound server-side. Change one rupee and authorization is invalid.", "success", { offerId, policyDecisionId: policyId });
  db.prepare("UPDATE buyer_intents SET state='OFFER_READY', lifecycle='RECOVERED_NOT_PAID' WHERE id=?").run(intentId);

  return { intentId, offerId, policyDecisionId: policyId, reservationId: reservation.id, steps, candidates, constraints, evidence: { gst, fsc } };
}

export function runReservationRace() {
  resetDemoState();
  const offerA = `raceA_${randomUUID()}`;
  const offerB = `raceB_${randomUUID()}`;
  const a = reserveInventory({ offerId: offerA, sku: DEMO.sku, locationId: DEMO.locations.edge.id, qty: 20 });
  const b = reserveInventory({ offerId: offerB, sku: DEMO.sku, locationId: DEMO.locations.edge.id, qty: 20 });
  audit({ eventType: "RESERVATION_RACE", actor: "INVENTORY_ENGINE", severity: "WARN", detail: "Two 20-unit buyers contended for 24 units at WH-PNQ-EDGE; atomic reservation allowed exactly one.", metadata: { firstSucceeded: Boolean(a), secondSucceeded: Boolean(b) } });
  const edge = (inventorySnapshot() as Array<{ location_id:string; available_qty:number }>).find((row) => row.location_id === DEMO.locations.edge.id);
  return { first: a ? "RESERVED" : "BLOCKED", second: b ? "RESERVED" : "BLOCKED", remainingAvailable: Number(edge?.available_qty ?? 0) };
}
