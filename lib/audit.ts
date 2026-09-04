import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { db, durableCheckpoint, durableDatabaseEnabled } from "@/lib/db";
import { DEMO } from "@/lib/config";
import { safeJson } from "@/lib/security";

export function audit(input: {
  intentId?: string | null;
  offerId?: string | null;
  eventType: string;
  actor: string;
  severity?: "INFO" | "WARN" | "BLOCK" | "SUCCESS";
  detail: string;
  metadata?: Record<string, unknown>;
}) {
  const id = `evt_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO audit_events
    (id, merchant_id, intent_id, offer_id, event_type, actor, severity, detail, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    DEMO.merchantId,
    input.intentId ?? null,
    input.offerId ?? null,
    input.eventType,
    input.actor,
    input.severity ?? "INFO",
    input.detail,
    safeJson(input.metadata ?? {}),
    createdAt
  );
  if(durableDatabaseEnabled()){
    try{after(async()=>{try{await durableCheckpoint()}catch(error){console.error("[RazorProcure] Durable checkpoint failed",error instanceof Error?error.message:"unknown error")}})}catch{}
  }
  return { id, createdAt };
}

export function listAudit(limit = 100) {
  const rows = db.prepare("SELECT * FROM audit_events ORDER BY created_at DESC LIMIT ?").all(limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({ ...r, metadata: JSON.parse(String(r.metadata)) }));
}
