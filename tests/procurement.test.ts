import { describe, expect, it } from "vitest";
import { compareConnectedSuppliers, getProcurementPolicy, matchProcurementProduct, normalizeProcurementProduct, optimizeProcurementBasket, parseProcurementRequest, updateProcurementPolicy } from "@/lib/procurement";
import { DEMO } from "@/lib/config";

describe("RazorProcure deterministic procurement",()=>{
  it("normalizes the demo product from natural language",()=>{
    expect(normalizeProcurementProduct("Fortune sunflower oil 1 litre carton")).toBe("fortune-sunflower-oil-1l-case48");
  });

  it("distinguishes exact, high-confidence, review, and incompatible matches",()=>{
    expect(matchProcurementProduct("Fortune Sunflower Oil 1L x 48").status).toBe("EXACT");
    expect(matchProcurementProduct("Fortune sunflower oil 1 litre carton").status).toBe("HIGH_CONFIDENCE");
    expect(matchProcurementProduct("sunflower oil for my store").status).toBe("REVIEW_REQUIRED");
    expect(matchProcurementProduct("Fortune sunflower oil 500ml x 48").status).toBe("NO_MATCH");
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

  it("optimizes the full usual basket and reports aggregate spend policy",()=>{
    const basket=optimizeProcurementBasket([
      {productKey:"fortune-sunflower-oil-1l-case48",cases:20},
      {productKey:"maggi-masala-70g-case96",cases:1},
      {productKey:"surf-excel-matic-1kg-case24",cases:1}
    ]);
    expect(basket.lines).toHaveLength(3);
    expect(basket.optimizedCostPaise).toBeLessThan(basket.usualCostPaise);
    expect(basket.savingsPaise).toBe(basket.usualCostPaise-basket.optimizedCostPaise);
    expect(basket.supplierAllocation.length).toBeGreaterThanOrEqual(2);
    expect(basket.policyResult).toBe("APPROVAL_REQUIRED");
  });

  it("applies the merchant's persisted autonomous spend control",()=>{
    const previous=getProcurementPolicy(DEMO.merchantId).autonomous_spend_limit_paise;
    try{
      updateProcurementPolicy(DEMO.merchantId,750_000);
      const options=compareConnectedSuppliers({productKey:"fortune-sunflower-oil-1l-case48",cases:1,budgetPaise:850_000,deadlineDays:2,requiresGstInvoice:true},DEMO.merchantId);
      expect(options.find(option=>option.checks.inventory==="PASS")?.policyResult).toBe("APPROVAL_REQUIRED");
    }finally{updateProcurementPolicy(DEMO.merchantId,previous)}
  });
});
