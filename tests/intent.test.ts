import { describe, expect, it } from "vitest";
import { parseBuyerIntentDeterministically } from "@/lib/intent";

describe("deterministic buyer intent parser", () => {
  it("parses the flagship mandate without financial inference", () => {
    const intent = parseBuyerIntentDeterministically("Buy 20 FSC-certified corporate gift boxes under ₹8,000, deliver to Pune by Monday, GST invoice required.");
    expect(intent.quantity).toBe(20);
    expect(intent.budgetMaxPaise).toBe(800_000);
    expect(intent.destination).toBe("Pune");
    expect(intent.hardRequirements).toEqual(["GST_INVOICE", "FSC_CERTIFIED"]);
  });
  it("fails closed when quantity/budget/destination cannot be established", () => {
    expect(() => parseBuyerIntentDeterministically("Find something nice.")).toThrow();
  });
});
