import { DEMO } from "@/lib/config";
import { compareMargin } from "@/lib/engines/accounting";

export function decidePolicy(input: { discountBps: number; contributionMargin: string }) {
  if (input.discountBps > DEMO.approvalDiscountCapBps) {
    return { result: "BLOCK" as const, reason: "Discount exceeds the merchant hard cap of 5%." };
  }
  if (!compareMargin(input.contributionMargin, DEMO.contributionFloor)) {
    return { result: "BLOCK" as const, reason: "Projected contribution margin falls below the 23% merchant floor." };
  }
  if (input.discountBps > DEMO.autonomousDiscountCapBps) {
    return { result: "APPROVAL_REQUIRED" as const, reason: "Economically safe, but discount is above the 4% autonomous approval threshold." };
  }
  return { result: "ALLOW" as const, reason: "All buyer, contribution-margin and autonomous-action guardrails pass." };
}
