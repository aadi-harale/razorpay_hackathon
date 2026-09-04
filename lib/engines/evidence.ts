import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "@/lib/db";
import { DEMO } from "@/lib/config";
import type { EvidenceFact } from "@/lib/types";

export function verifyFscCertificate(input: {
  source: string;
  validFrom: string;
  validUntil: string;
  scope: string;
  requiredScope: string;
  now?: Date;
}): EvidenceFact {
  const now = input.now ?? new Date();
  const from = new Date(`${input.validFrom}T00:00:00Z`);
  const until = new Date(`${input.validUntil}T23:59:59Z`);
  const scopePass = input.scope.toLowerCase().includes(input.requiredScope.toLowerCase());
  const datePass = Number.isFinite(from.getTime()) && Number.isFinite(until.getTime()) && now >= from && now <= until;

  if (!scopePass || !datePass) {
    return {
      predicate: "FSC_CERTIFIED",
      status: "UNVERIFIED",
      evidenceClass: "TIME_BOUNDED_CREDENTIAL",
      source: input.source,
      detail: !scopePass ? "Certificate scope does not cover the selected SKU family." : "Certificate is outside its validity window.",
      validFrom: input.validFrom,
      validUntil: input.validUntil,
      scope: input.scope
    };
  }

  return {
    predicate: "FSC_CERTIFIED",
    status: "VERIFIED_CURRENT",
    evidenceClass: "TIME_BOUNDED_CREDENTIAL",
    source: input.source,
    detail: "Validity window contains today and certificate scope covers BX-series packaging.",
    validFrom: input.validFrom,
    validUntil: input.validUntil,
    scope: input.scope
  };
}

export function currentGstCapability(): EvidenceFact {
  const row = db.prepare(`SELECT gst_registered, gstin, invoice_generation_enabled FROM merchant_tax_configs WHERE merchant_id=?`)
    .get(DEMO.merchantId) as { gst_registered: number; gstin: string | null; invoice_generation_enabled: number } | undefined;
  const pass = Boolean(row?.gst_registered && row?.gstin && row?.invoice_generation_enabled);
  return {
    predicate: "GST_INVOICE_AVAILABLE",
    status: pass ? "VERIFIED_CURRENT" : "UNKNOWN",
    evidenceClass: "CURRENT_STATE",
    source: "merchant_tax_configuration",
    detail: pass
      ? `Current merchant tax configuration confirms GST registration (${row?.gstin}) and invoice generation are enabled.`
      : "Current merchant tax configuration does not establish GST invoice capability."
  };
}

export function historicalInvoiceDoesNotProveCurrentCapability(): EvidenceFact {
  return {
    predicate: "GST_INVOICE_HISTORICALLY_ISSUED",
    status: "VERIFIED_HISTORICAL",
    evidenceClass: "HISTORICAL_EVENT",
    source: "invoice_381.png",
    detail: "Historical issuance is recorded but cannot satisfy a current GST-invoice capability requirement."
  };
}

export function parseFscFieldsFromText(raw: string) {
  const validFrom = raw.match(/Valid\s+From\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1];
  const validUntil = raw.match(/Valid\s+Until\s*:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})/i)?.[1];
  // In a basic PDF text stream a line commonly ends with `) Tj`; do not leak
  // those drawing operators into the business value. Plain-text inputs still
  // terminate at their newline or end of string.
  const scope = raw.match(/Scope\s*:\s*(.*?)(?=\)\s*Tj|\r?\n|$)/i)?.[1]?.trim();
  return { validFrom, validUntil, scope };
}

export function loadDemoFscCertificate(now = new Date()): EvidenceFact {
  const source = "FSC_Certificate_2026.pdf";
  const filePath = resolve(process.cwd(), "demo-data", source);
  const raw = readFileSync(filePath).toString("latin1");
  const { validFrom, validUntil, scope } = parseFscFieldsFromText(raw);
  if (!validFrom || !validUntil || !scope) {
    return { predicate: "FSC_CERTIFIED", status: "UNKNOWN", evidenceClass: "TIME_BOUNDED_CREDENTIAL", source, detail: "Required validity/scope fields could not be deterministically extracted from the demo certificate." };
  }
  return verifyFscCertificate({ source, validFrom, validUntil, scope, requiredScope: "BX-series", now });
}
