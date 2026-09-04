import { beforeEach, describe, expect, it } from "vitest";
import { resetDemoState } from "@/lib/demo";
import { reserveInventory, inventorySnapshot } from "@/lib/inventory";
import { DEMO } from "@/lib/config";

describe("atomic per-location reservations",()=>{
  beforeEach(()=>resetDemoState());
  it("allows exactly one of two 20-unit reservations against 24 available",()=>{
    const a=reserveInventory({offerId:"a",sku:DEMO.sku,locationId:DEMO.locations.edge.id,qty:20});
    const b=reserveInventory({offerId:"b",sku:DEMO.sku,locationId:DEMO.locations.edge.id,qty:20});
    expect(Boolean(a)).not.toBe(Boolean(b));
    const edge=(inventorySnapshot() as Array<{location_id:string;available_qty:number}>).find(x=>x.location_id===DEMO.locations.edge.id);
    expect(edge).toBeDefined();
    expect(edge?.available_qty).toBe(4);
  });
});

import { commitReservation, releaseExpiredReservations } from "@/lib/inventory";
import { db } from "@/lib/db";

describe("reservation lifecycle", () => {
  beforeEach(() => resetDemoState());

  it("commits an active reservation exactly once", () => {
    const reservation = reserveInventory({ offerId: "commit-once", sku: DEMO.sku, locationId: DEMO.locations.edge.id, qty: 5 });
    expect(reservation).not.toBeNull();
    expect(commitReservation(reservation!.id)).toBe(true);
    expect(commitReservation(reservation!.id)).toBe(false);
    const edge = (inventorySnapshot() as Array<{location_id:string;on_hand_qty:number;reserved_qty:number}>).find((x) => x.location_id === DEMO.locations.edge.id);
    expect(edge?.on_hand_qty).toBe(19);
    expect(edge?.reserved_qty).toBe(0);
  });

  it("expires and releases an abandoned reservation", () => {
    const reservation = reserveInventory({ offerId: "expire-me", sku: DEMO.sku, locationId: DEMO.locations.edge.id, qty: 5, ttlSeconds: 60 });
    expect(reservation).not.toBeNull();
    db.prepare("UPDATE inventory_reservations SET expires_at=? WHERE id=?").run(new Date(Date.now()-1000).toISOString(), reservation!.id);
    releaseExpiredReservations();
    const row = db.prepare("SELECT status FROM inventory_reservations WHERE id=?").get(reservation!.id) as {status:string};
    expect(row.status).toBe("EXPIRED");
    const edge = (inventorySnapshot() as Array<{location_id:string;on_hand_qty:number;reserved_qty:number}>).find((x) => x.location_id === DEMO.locations.edge.id);
    expect(edge?.on_hand_qty).toBe(24);
    expect(edge?.reserved_qty).toBe(0);
  });
});
