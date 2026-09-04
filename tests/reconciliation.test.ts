import { describe, expect, it } from "vitest";
import { reconcileThreeWay } from "@/lib/reconciliation";

describe("three-way receiving reconciliation",()=>{
  it("closes an order only when PO, receipt and invoice match",()=>{
    expect(reconcileThreeWay({orderedCases:2,receivedCases:2,authorizedAmountPaise:1_544_000,invoicedAmountPaise:1_544_000})).toMatchObject({
      status:"MATCHED",
      checks:{purchaseOrder:"PASS",receipt:"PASS",invoice:"PASS"},
      protectedValuePaise:0,
      exceptions:[]
    });
  });

  it("blocks an invoice overcharge and quantifies protected spend",()=>{
    const result=reconcileThreeWay({orderedCases:1,receivedCases:1,authorizedAmountPaise:772_000,invoicedAmountPaise:797_000});
    expect(result.status).toBe("EXCEPTION_BLOCKED");
    expect(result.checks).toEqual({purchaseOrder:"PASS",receipt:"PASS",invoice:"FAIL"});
    expect(result.invoiceVariancePaise).toBe(25_000);
    expect(result.protectedValuePaise).toBe(25_000);
  });

  it("blocks a short delivery against its fair received value",()=>{
    const result=reconcileThreeWay({orderedCases:2,receivedCases:1,authorizedAmountPaise:1_544_000,invoicedAmountPaise:1_544_000});
    expect(result.status).toBe("EXCEPTION_BLOCKED");
    expect(result.checks.receipt).toBe("FAIL");
    expect(result.fairReceivedValuePaise).toBe(772_000);
    expect(result.protectedValuePaise).toBe(772_000);
  });

  it("rejects unsafe or nonsensical accounting inputs",()=>{
    expect(()=>reconcileThreeWay({orderedCases:0,receivedCases:0,authorizedAmountPaise:1,invoicedAmountPaise:1})).toThrow();
    expect(()=>reconcileThreeWay({orderedCases:1,receivedCases:1.5,authorizedAmountPaise:1,invoicedAmountPaise:1})).toThrow();
  });
});
