import { describe, expect, it } from "vitest";
import { canProceed, hardEvidenceConstraint, softEvidenceConstraint } from "@/lib/engines/constraints";
import { currentGstCapability, historicalInvoiceDoesNotProveCurrentCapability } from "@/lib/engines/evidence";

describe("HARD / SOFT constraint semantics",()=>{
  it("blocks when current authority is absent for a HARD requirement",()=>{
    const c=hardEvidenceConstraint("FSC certified","FSC_CERTIFIED",null);
    expect(c.state).toBe("UNKNOWN");
    expect(canProceed([c])).toBe(false);
  });
  it("historical invoice cannot establish current GST capability",()=>{
    const c=hardEvidenceConstraint("GST invoice","GST_INVOICE_AVAILABLE",historicalInvoiceDoesNotProveCurrentCapability());
    expect(c.state).toBe("UNKNOWN");
  });
  it("current merchant tax config can satisfy the hard GST requirement",()=>{
    const c=hardEvidenceConstraint("GST invoice","GST_INVOICE_AVAILABLE",currentGstCapability());
    expect(c.state).toBe("PASS");
  });
  it("allows a SOFT unknown to remain a candidate without claiming satisfaction",()=>{
    const c=softEvidenceConstraint("Preferred recycled tissue","RECYCLED_TISSUE",null);
    expect(c.state).toBe("UNKNOWN");
    expect(canProceed([c])).toBe(true);
  });
});
