import { describe, expect, it } from "vitest";
import type { ProcurementOption } from "@/lib/procurement";
import { analyzeProcurementResilience } from "@/lib/resilience";

function option(input:Partial<ProcurementOption>&Pick<ProcurementOption,"listingId"|"supplierName"|"grossPayablePaise"|"casePricePaise"|"shippingPaise"|"availableCases"|"etaDays"|"reliability">):ProcurementOption{
  return {supplierId:input.listingId,supplierRole:"CONNECTED",listingTitle:input.supplierName,verification:"VERIFIED",gstInvoice:true,economicLandedPaise:input.grossPayablePaise,savingsVsUsualPaise:0,exactMatch:true,policyResult:"ALLOW",rank:1,checks:{budget:"PASS",delivery:"PASS",inventory:"PASS",gstInvoice:"PASS",supplier:"PASS",spendLimit:"PASS"},...input};
}

const options=[
  option({listingId:"a",supplierName:"Pune Wholesale Hub",grossPayablePaise:772_000,casePricePaise:760_000,shippingPaise:12_000,availableCases:12,etaDays:1,reliability:97}),
  option({listingId:"b",supplierName:"Shree Distributors",grossPayablePaise:775_000,casePricePaise:775_000,shippingPaise:0,availableCases:9,etaDays:1,reliability:92}),
  option({listingId:"c",supplierName:"MetroTrade Supplies",grossPayablePaise:790_000,casePricePaise:742_000,shippingPaise:48_000,availableCases:25,etaDays:2,reliability:95})
];

describe("procurement digital twin",()=>{
  const result=()=>analyzeProcurementResilience({options,selectedListingId:"a",cases:1,budgetPaise:850_000,deadlineDays:2,spendLimitPaise:1_500_000});

  it("stress-tests four distinct disruption scenarios",()=>{
    expect(result().scenarios.map(scenario=>scenario.id)).toEqual(["PRICE_SHOCK","SUPPLIER_OUTAGE","DELIVERY_SLIP","DEMAND_SURGE"]);
  });

  it("pre-clears the best recurring fallback without changing the live order",()=>{
    const twin=result();
    expect(twin.preClearedFallback).toEqual({supplierName:"Shree Distributors",payablePaise:775_000,deltaPaise:3_000});
    expect(twin.autonomyEnvelope).toEqual({safe:3,approvals:1,blocked:0,total:4});
  });

  it("quantifies downside avoided during a selected-supplier price shock",()=>{
    const shock=result().scenarios.find(scenario=>scenario.id==="PRICE_SHOCK")!;
    expect(shock.outcome).toBe("SWITCH");
    expect(shock.supplierName).toBe("Shree Distributors");
    expect(shock.protectedValuePaise).toBe(51_040);
  });

  it("keeps doubled demand behind the merchant approval boundary",()=>{
    const surge=result().scenarios.find(scenario=>scenario.id==="DEMAND_SURGE")!;
    expect(surge.outcome).toBe("APPROVAL_REQUIRED");
    expect(surge.payablePaise).toBeGreaterThan(1_500_000);
  });

  it("fails closed when the persisted selected supplier is missing",()=>{
    expect(()=>analyzeProcurementResilience({options,selectedListingId:"missing",cases:1,budgetPaise:850_000,deadlineDays:2,spendLimitPaise:1_500_000})).toThrow("RESILIENCE_PLAN_INVALID");
  });
});
