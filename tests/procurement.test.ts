import { describe, expect, it } from "vitest";
import { compareConnectedSuppliers, normalizeProcurementProduct, parseProcurementRequest } from "@/lib/procurement";

describe("RazorProcure deterministic procurement",()=>{
  it("normalizes the demo product from natural language",()=>{
    expect(normalizeProcurementProduct("Fortune sunflower oil 1 litre carton")).toBe("fortune-sunflower-oil-1l-case48");
  });

  it("parses integer budget and deadline without financial float arithmetic",()=>{
    const p=parseProcurementRequest("Buy 1 case Fortune oil under ₹8,500 within 2 days with GST invoice");
    expect(p.cases).toBe(1);
    expect(p.budgetPaise).toBe(850000);
    expect(p.deadlineDays).toBe(2);
    expect(p.requiresGstInvoice).toBe(true);
  });

  it("ranks the lowest safe connected supplier before blocked options",()=>{
    const options=compareConnectedSuppliers({productKey:"fortune-sunflower-oil-1l-case48",cases:1,budgetPaise:850000,deadlineDays:2,requiresGstInvoice:true});
    expect(options.length).toBeGreaterThanOrEqual(3);
    expect(options[0].policyResult).toBe("ALLOW");
    expect(options[0].grossPayablePaise).toBeLessThanOrEqual(850000);
    expect(options[0].checks.inventory).toBe("PASS");
    expect(options[0].checks.delivery).toBe("PASS");
    expect(options[0].checks.gstInvoice).toBe("PASS");
  });

  it("fails closed when the retailer budget cannot satisfy any connected listing",()=>{
    const options=compareConnectedSuppliers({productKey:"fortune-sunflower-oil-1l-case48",cases:1,budgetPaise:100000,deadlineDays:2,requiresGstInvoice:true});
    expect(options.every(o=>o.policyResult==="BLOCK")).toBe(true);
    expect(options.every(o=>o.checks.budget==="FAIL")).toBe(true);
  });
});
