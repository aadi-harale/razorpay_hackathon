import { randomUUID } from "node:crypto";
import { DEMO, gatewayFeeGstRecoverable } from "@/lib/config";
import { currentGstCapability, loadDemoFscCertificate } from "@/lib/engines/evidence";
import { calculateAccounting, compareMargin } from "@/lib/engines/accounting";
import { inventorySnapshot } from "@/lib/inventory";
import type { BuyerIntentInput } from "@/lib/intent";

export function evaluateAgentIntent(intent: BuyerIntentInput) {
  const evaluationId = `eval_${randomUUID()}`;
  const gst = currentGstCapability();
  const fsc = loadDemoFscCertificate();
  const hardFailures: string[] = [];
  if (intent.hardRequirements.includes("GST_INVOICE") && gst.status !== "VERIFIED_CURRENT") hardFailures.push("GST_INVOICE_UNKNOWN");
  if (intent.hardRequirements.includes("FSC_CERTIFIED") && fsc.status !== "VERIFIED_CURRENT") hardFailures.push("FSC_CERTIFIED_UNKNOWN");
  if (hardFailures.length) {
    return { evaluationId, decision: "INELIGIBLE_PENDING_EVIDENCE" as const, hardFailures, candidates: [], recommended: null, evidence: { gst: gst.status, fsc: fsc.status }, provenance: "OBSERVED" as const };
  }

  const inventory = inventorySnapshot() as Array<{ location_id: string; available_qty: number }>;
  const merchandiseGrossPaise = DEMO.unitGrossPaise * intent.quantity;
  const economicCogsPaise = DEMO.unitEconomicCogsPaise * intent.quantity;
  const candidates = [] as Array<{
    route: string;
    label: string;
    finalPayablePaise: number;
    netSalesRevenuePaise: number;
    contributionPaise: number;
    contributionMargin: string;
    availableQty: number;
    checks: { budget: "PASS"|"FAIL"; contributionFloor: "PASS"|"FAIL"; inventory: "PASS"|"FAIL" };
    offerable: boolean;
  }>;

  for (const route of [DEMO.locations.central, DEMO.locations.edge]) {
    if (route.id === DEMO.locations.edge.id && !/pune|pnq/i.test(intent.destination)) continue;
    const stock = inventory.find((x) => x.location_id === route.id);
    const available = Number(stock?.available_qty ?? 0);
    const accounting = calculateAccounting({
      merchandiseGrossPaise,
      buyerShippingChargePaise: route.buyerShippingChargePaise,
      outputGstRate: DEMO.outputGstRate,
      economicCogsPaise,
      fulfilmentCostPaise: route.fulfilmentCostPaise,
      processorPlatformRate: DEMO.gatewayPlatformRate,
      gatewayFeeGstRate: DEMO.gatewayFeeGstRate,
      gatewayFeeGstRecoverable: gatewayFeeGstRecoverable()
    });
    const budgetPass = accounting.grossCustomerPayablePaise <= intent.budgetMaxPaise;
    const marginPass = compareMargin(accounting.contributionMargin, DEMO.contributionFloor);
    const inventoryPass = available >= intent.quantity;
    candidates.push({
      route: route.id,
      label: route.label,
      finalPayablePaise: accounting.grossCustomerPayablePaise,
      netSalesRevenuePaise: accounting.netSalesRevenuePaise,
      contributionPaise: accounting.contributionPaise,
      contributionMargin: accounting.contributionMargin,
      availableQty: available,
      checks: { budget: budgetPass ? "PASS" : "FAIL", contributionFloor: marginPass ? "PASS" : "FAIL", inventory: inventoryPass ? "PASS" : "FAIL" },
      offerable: budgetPass && marginPass && inventoryPass
    });
  }
  const recommended = candidates.filter((c) => c.offerable).sort((a,b) => b.contributionPaise - a.contributionPaise)[0] ?? null;
  return { evaluationId, decision: recommended ? "OFFERABLE" as const : "REJECTED" as const, recommended, candidates, hardFailures, evidence: { gst: gst.status, fsc: fsc.status }, provenance: "OBSERVED" as const };
}

export function agentOfferPreview(intent: BuyerIntentInput) {
  const evaluation = evaluateAgentIntent(intent);
  if (!evaluation.recommended) return { ...evaluation, offer: null };
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  return {
    ...evaluation,
    offer: {
      previewId: `preview_${randomUUID()}`,
      sku: DEMO.sku,
      productName: DEMO.productName,
      quantity: intent.quantity,
      route: evaluation.recommended.route,
      finalPayablePaise: evaluation.recommended.finalPayablePaise,
      currency: DEMO.currency,
      expiresAt,
      authority: "NON_BINDING_AGENT_PREVIEW",
      nextStep: "Final checkout requires authenticated server-bound offer, policy decision and atomic inventory reservation."
    }
  };
}
