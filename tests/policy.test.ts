import { describe, expect, it } from "vitest";
import { decidePolicy } from "@/lib/engines/policy";

describe("discount policy boundaries", () => {
  it("allows exactly 4% when contribution floor passes", () => {
    expect(decidePolicy({ discountBps: 400, contributionMargin: "0.30" }).result).toBe("ALLOW");
  });
  it("requires approval at 4.5%", () => {
    expect(decidePolicy({ discountBps: 450, contributionMargin: "0.30" }).result).toBe("APPROVAL_REQUIRED");
  });
  it("blocks above 5%", () => {
    expect(decidePolicy({ discountBps: 501, contributionMargin: "0.30" }).result).toBe("BLOCK");
  });
  it("margin floor wins even when discount is autonomous", () => {
    expect(decidePolicy({ discountBps: 100, contributionMargin: "0.2299" }).result).toBe("BLOCK");
  });
});
