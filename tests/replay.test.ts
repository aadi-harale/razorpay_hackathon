import { describe, expect, it } from "vitest";
import { multiFixCombinations, opportunityCards, pairedReplayDetailed, pairedReplaySummary, statefulPortfolioReplaySummary } from "@/lib/replay";

describe("paired deterministic replay", () => {
  it("has zero isolated control-to-treatment regressions", () => {
    const r = pairedReplaySummary(1000, 20260904);
    expect(r.regressions).toBe(0);
    expect(r.treatmentPaid).toBeGreaterThanOrEqual(r.controlPaid);
  });
  it("is deterministic for the same seed", () => {
    expect(pairedReplaySummary(250, 77)).toEqual(pairedReplaySummary(250, 77));
  });
  it("single-fix opportunities never fractionally allocate a joint blocker", () => {
    const results = pairedReplayDetailed(1000, 20260904);
    const opps = opportunityCards(results);
    expect(opps.every((o) => Number.isInteger(o.affected) && Number.isInteger(o.newlyConverted))).toBe(true);
    expect(multiFixCombinations(results).every((x) => x.combination.includes(" + "))).toBe(true);
  });
  it("keeps stateful portfolio replay explicitly separate", () => {
    const r = statefulPortfolioReplaySummary(120, 20260904);
    expect(r.intents).toBe(120);
    expect(r.label).toContain("Stateful portfolio simulation");
  });
});
