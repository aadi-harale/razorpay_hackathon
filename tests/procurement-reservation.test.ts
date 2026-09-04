import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createProcurementRun, reserveSupplierForRun } from "@/lib/procurement";
import { DEMO } from "@/lib/config";

describe("supplier reservation safety",()=>{
  beforeEach(()=>{
    db.prepare(`DELETE FROM procurement_receipts`).run();
    db.prepare(`DELETE FROM procurement_orders`).run();
    db.prepare(`DELETE FROM supplier_reservations`).run();
    db.prepare(`DELETE FROM procurement_run_options`).run();
    db.prepare(`DELETE FROM procurement_runs`).run();
    db.prepare(`UPDATE supplier_listings SET reserved_cases=0`).run();
    db.prepare(`UPDATE supplier_listings SET available_cases=1 WHERE id='SUP-PNQ__fortune-sunflower-oil-1l-case48'`).run();
  });
  afterEach(()=>{ db.prepare(`UPDATE supplier_listings SET available_cases=12,reserved_cases=0 WHERE id='SUP-PNQ__fortune-sunflower-oil-1l-case48'`).run(); });
  it("prevents two precomputed safe plans from overselling the last supplier case",()=>{
    const text="Buy 1 case of Fortune Sunflower Oil 1L x 48 under ₹8,500 within 2 days with GST invoice";
    const first=createProcurementRun(text,DEMO.merchantId);
    const second=createProcurementRun(text,DEMO.merchantId);
    expect(first.recommended?.supplierId).toBe("SUP-PNQ");
    expect(second.recommended?.supplierId).toBe("SUP-PNQ");
    expect(()=>reserveSupplierForRun(first.runId,DEMO.merchantId)).not.toThrow();
    expect(()=>reserveSupplierForRun(second.runId,DEMO.merchantId)).toThrow(/PROCUREMENT_PLAN_NO_LONGER_SAFE|SUPPLIER_INVENTORY_RESERVATION_FAILED/);
    const listing=db.prepare(`SELECT available_cases,reserved_cases FROM supplier_listings WHERE id='SUP-PNQ__fortune-sunflower-oil-1l-case48'`).get() as {available_cases:number;reserved_cases:number};
    expect(listing.reserved_cases).toBe(1);
    expect(listing.reserved_cases).toBeLessThanOrEqual(listing.available_cases);
  });
});
