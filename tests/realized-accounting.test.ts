import { describe, expect, it } from "vitest";
import { calculateRealizedContribution } from "@/lib/engines/accounting";

describe("realized gateway economics", () => {
  it("removes gateway GST from economic processor cost when ITC is recoverable", () => {
    const r = calculateRealizedContribution({ grossCustomerPayablePaise:798000, outputGstRate:"0.18", economicCogsPaise:460000, fulfilmentCostPaise:6000, processorFeeIncludingTaxPaise:28249, processorTaxPaise:4309, gatewayFeeGstRecoverable:true });
    expect(r.processorCostPaise).toBe(23940);
    expect(r.contributionPaise).toBe(186331);
  });
  it("keeps fee tax when ITC is not recoverable", () => {
    const r = calculateRealizedContribution({ grossCustomerPayablePaise:798000, outputGstRate:"0.18", economicCogsPaise:460000, fulfilmentCostPaise:6000, processorFeeIncludingTaxPaise:28249, processorTaxPaise:4309, gatewayFeeGstRecoverable:false });
    expect(r.processorCostPaise).toBe(28249);
    expect(Number(r.contributionMargin)).toBeGreaterThan(0.23);
  });
});
