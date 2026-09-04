import { describe, expect, it } from "vitest";
import { DEMO } from "@/lib/config";
import { applyDiscount, calculateAccounting, minimumDiscountBpsToMeetBudget } from "@/lib/engines/accounting";

const merchandise = DEMO.unitGrossPaise * DEMO.quantity;
function run(merch:number, ship:number, fulfil:number, gatewayTaxRecoverable=true){
  return calculateAccounting({merchandiseGrossPaise:merch,buyerShippingChargePaise:ship,outputGstRate:DEMO.outputGstRate,economicCogsPaise:DEMO.economicCogsPaise,fulfilmentCostPaise:fulfil,processorPlatformRate:DEMO.gatewayPlatformRate,gatewayFeeGstRate:DEMO.gatewayFeeGstRate,gatewayFeeGstRecoverable:gatewayTaxRecoverable});
}

describe("golden accounting vectors",()=>{
  it("baseline reproduces the frozen vector",()=>{
    const r=run(merchandise,25_000,45_000);
    expect(r.grossCustomerPayablePaise).toBe(823_000);
    expect(r.netSalesRevenuePaise).toBe(697_458);
    expect(r.processorCostPaise).toBe(24_690);
    expect(r.contributionPaise).toBe(167_768);
    expect(Number(r.contributionMargin)).toBeCloseTo(0.24054,4);
  });
  it("3% discount blocks below 23%",()=>{
    const r=run(applyDiscount(merchandise,300),25_000,45_000);
    expect(r.grossCustomerPayablePaise).toBe(799_060);
    expect(r.netSalesRevenuePaise).toBe(677_169);
    expect(r.processorCostPaise).toBe(23_972);
    expect(r.contributionPaise).toBe(148_197);
    expect(Number(r.contributionMargin)).toBeCloseTo(0.21885,4);
  });
  it("minimum viable discount hits exactly ₹8,000 and still blocks",()=>{
    const bps=minimumDiscountBpsToMeetBudget(merchandise,25_000,800_000);
    expect(bps).toBeCloseTo(288.2206,4);
    const r=run(775_000,25_000,45_000);
    expect(r.grossCustomerPayablePaise).toBe(800_000);
    expect(r.netSalesRevenuePaise).toBe(677_966);
    expect(r.processorCostPaise).toBe(24_000);
    expect(r.contributionPaise).toBe(148_966);
    expect(Number(r.contributionMargin)).toBeCloseTo(0.21973,4);
  });
  it("Pune edge route safely clears the floor",()=>{
    const r=run(merchandise,0,6_000);
    expect(r.grossCustomerPayablePaise).toBe(798_000);
    expect(r.netSalesRevenuePaise).toBe(676_271);
    expect(r.processorCostPaise).toBe(23_940);
    expect(r.contributionPaise).toBe(186_331);
    expect(Number(r.contributionMargin)).toBeCloseTo(0.27553,4);
  });
  it("decisions survive non-recoverable gateway fee GST",()=>{
    const a=run(applyDiscount(merchandise,300),25_000,45_000,false);
    const b=run(merchandise,0,6_000,false);
    expect(Number(a.contributionMargin)).toBeLessThan(0.23);
    expect(Number(b.contributionMargin)).toBeGreaterThan(0.23);
  });
});
