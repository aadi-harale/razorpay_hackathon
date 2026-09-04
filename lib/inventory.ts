import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { DEMO } from "@/lib/config";

export function releaseExpiredReservations() {
  const now = new Date().toISOString();
  const expired = db.prepare(`
    SELECT id FROM inventory_reservations WHERE status='ACTIVE' AND expires_at <= ?
  `).all(now) as Array<{ id: string }>;

  const releaseOne = db.transaction((id: string) => {
    const r = db.prepare(`
      SELECT merchant_id, sku, location_id, qty
      FROM inventory_reservations
      WHERE id=? AND status='ACTIVE' AND expires_at <= ?
    `).get(id, now) as { merchant_id: string; sku: string; location_id: string; qty: number } | undefined;
    if (!r) return false;
    const claimed = db.prepare("UPDATE inventory_reservations SET status='EXPIRED' WHERE id=? AND status='ACTIVE'").run(id);
    if (claimed.changes !== 1) return false;
    const stock = db.prepare(`
      UPDATE inventory_location
      SET reserved_qty = reserved_qty - ?, updated_at = ?
      WHERE merchant_id=? AND sku=? AND location_id=? AND reserved_qty >= ?
    `).run(r.qty, now, r.merchant_id, r.sku, r.location_id, r.qty);
    if (stock.changes !== 1) throw new Error("RESERVATION_RELEASE_INVARIANT_FAILED");
    return true;
  });

  for (const row of expired) releaseOne(row.id);
}

export function reserveInventory(input: { offerId: string; sku: string; locationId: string; qty: number; ttlSeconds?: number }) {
  releaseExpiredReservations();
  const id = `res_${randomUUID()}`;
  const now = new Date();
  const expires = new Date(now.getTime() + (input.ttlSeconds ?? DEMO.reservationTtlSeconds) * 1000);

  const tx = db.transaction(() => {
    const result = db.prepare(`
      UPDATE inventory_location
      SET reserved_qty = reserved_qty + ?, updated_at = ?
      WHERE merchant_id = ? AND sku = ? AND location_id = ?
        AND on_hand_qty - reserved_qty >= ?
    `).run(input.qty, now.toISOString(), DEMO.merchantId, input.sku, input.locationId, input.qty);
    if (result.changes !== 1) return null;
    db.prepare(`
      INSERT INTO inventory_reservations
      (id, merchant_id, sku, location_id, qty, offer_id, expires_at, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
    `).run(id, DEMO.merchantId, input.sku, input.locationId, input.qty, input.offerId, expires.toISOString(), now.toISOString());
    return { id, expiresAt: expires.toISOString() };
  });
  return tx();
}

export function commitReservation(id: string) {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    const r = db.prepare(`
      SELECT merchant_id, sku, location_id, qty
      FROM inventory_reservations
      WHERE id=? AND status='ACTIVE' AND expires_at > ?
    `).get(id, now) as { merchant_id: string; sku: string; location_id: string; qty: number } | undefined;
    if (!r) return false;

    const claimed = db.prepare(`
      UPDATE inventory_reservations
      SET status='COMMITTED'
      WHERE id=? AND status='ACTIVE' AND expires_at > ?
    `).run(id, now);
    if (claimed.changes !== 1) return false;

    const stock = db.prepare(`
      UPDATE inventory_location
      SET on_hand_qty=on_hand_qty-?, reserved_qty=reserved_qty-?, updated_at=?
      WHERE merchant_id=? AND sku=? AND location_id=?
        AND on_hand_qty >= ? AND reserved_qty >= ?
    `).run(r.qty, r.qty, now, r.merchant_id, r.sku, r.location_id, r.qty, r.qty);
    if (stock.changes !== 1) throw new Error("RESERVATION_COMMIT_INVARIANT_FAILED");
    return true;
  });
  return tx();
}

export function inventorySnapshot() {
  releaseExpiredReservations();
  return db.prepare(`SELECT location_id, on_hand_qty, reserved_qty, on_hand_qty-reserved_qty AS available_qty FROM inventory_location WHERE merchant_id=? AND sku=? ORDER BY location_id`)
    .all(DEMO.merchantId, DEMO.sku);
}
