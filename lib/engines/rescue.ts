import { DEMO, gatewayFeeGstRecoverable } from "@/lib/config";
import { applyDiscount, calculateAccounting, minimumDiscountBpsToMeetBudget } from "@/lib/engines/accounting";
import { decidePolicy } from "@/lib/engines/policy";
import type { DemoCandidate } from "@/lib/types";

const baseMerchandise = DEMO.unitGrossPaise * DEMO.quantity;

function candidate(input: {
  id: string;
  label: string;
  description: string;
  locationId: string;
  merchandiseGrossPaise: number;
  shippingPaise: number;
  fulfilmentPaise: number;
  discountBps: number;
}): DemoCandidate {
  const accounting = calculateAccounting({
    merchandiseGrossPaise: input.merchandiseGrossPaise,
    buyerShippingChargePaise: input.shippingPaise,
    outputGstRate: DEMO.outputGstRate,
    economicCogsPaise: DEMO.economicCogsPaise,
    fulfilmentCostPaise: input.fulfilmentPaise,
    processorPlatformRate: DEMO.gatewayPlatformRate,
    gatewayFeeGstRate: DEMO.gatewayFeeGstRate,
    gatewayFeeGstRecoverable: gatewayFeeGstRecoverable()
  });
  const buyerPasses = accounting.grossCustomerPayablePaise <= DEMO.buyerBudgetGrossPaise;
  const policy = decidePolicy({ discountBps: input.discountBps, contributionMargin: accounting.contributionMargin });
  return { ...input, buyerPasses, policyResult: policy.result, policyReason: policy.reason, accounting };
}

export function buildCandidates() {
  const minBps = minimumDiscountBpsToMeetBudget(
    baseMerchandise,
    DEMO.locations.central.buyerShippingChargePaise,
    DEMO.buyerBudgetGrossPaise
  );
  const baseline = candidate({
    id: "baseline",
    label: "Baseline · central fulfilment",
    description: "Default B2B route; merchant-safe but buyer budget fails.",
    locationId: DEMO.locations.central.id,
    merchandiseGrossPaise: baseMerchandise,
    shippingPaise: DEMO.locations.central.buyerShippingChargePaise,
    fulfilmentPaise: DEMO.locations.central.fulfilmentCostPaise,
    discountBps: 0
  });
  const minimumDiscount = candidate({
    id: "candidate-min",
    label: `Minimum viable discount · ${(minBps / 100).toFixed(4)}%`,
    description: "Smallest central-route discount that reaches the buyer ceiling; still fails merchant economics.",
    locationId: DEMO.locations.central.id,
    merchandiseGrossPaise: DEMO.buyerBudgetGrossPaise - DEMO.locations.central.buyerShippingChargePaise,
    shippingPaise: DEMO.locations.central.buyerShippingChargePaise,
    fulfilmentPaise: DEMO.locations.central.fulfilmentCostPaise,
    discountBps: minBps
  });
  const threePercent = candidate({
    id: "candidate-a",
    label: "3% discount · central fulfilment",
    description: "Buyer budget passes; contribution floor does not.",
    locationId: DEMO.locations.central.id,
    merchandiseGrossPaise: applyDiscount(baseMerchandise, 300),
    shippingPaise: DEMO.locations.central.buyerShippingChargePaise,
    fulfilmentPaise: DEMO.locations.central.fulfilmentCostPaise,
    discountBps: 300
  });
  const edge = candidate({
    id: "candidate-b",
    label: "Pune edge fulfilment · no discount",
    description: "Changes underlying fulfilment topology instead of giving price away.",
    locationId: DEMO.locations.edge.id,
    merchandiseGrossPaise: baseMerchandise,
    shippingPaise: DEMO.locations.edge.buyerShippingChargePaise,
    fulfilmentPaise: DEMO.locations.edge.fulfilmentCostPaise,
    discountBps: 0
  });
  return { baseline, minimumDiscount, threePercent, edge, minBps };
}
