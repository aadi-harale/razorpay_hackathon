import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { db } from "@/lib/db";
import { parseFscFieldsFromText, verifyFscCertificate } from "@/lib/engines/evidence";
import { audit } from "@/lib/audit";
import type { EvidenceFact } from "@/lib/types";

const MAX_BYTES = 5 * 1024 * 1024;
const allowed = new Map<string, Set<string>>([
  [".pdf", new Set(["application/pdf"])],
  [".csv", new Set(["text/csv", "application/vnd.ms-excel", "text/plain"])],
  [".xlsx", new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])],
  [".png", new Set(["image/png"])],
  [".jpg", new Set(["image/jpeg"])],
  [".jpeg", new Set(["image/jpeg"])],
  [".webp", new Set(["image/webp"])],
]);

const injectionPattern = /(ignore\s+(all\s+)?previous|system\s+prompt|mark\s+.*certified|approve\s+this\s+offer|give\s+\d+%\s+discount)/i;

function id(prefix: string) { return `${prefix}_${randomUUID()}`; }

function safeOriginalName(name: string) {
  const trimmed = name.trim().slice(0, 180);
  return trimmed.replace(/[\u0000-\u001f\u007f]/g, "_") || "upload";
}

function saveFact(merchantId: string, sourceId: string, fact: EvidenceFact, evidenceSpan: string | null, verifier: string) {
  db.prepare(`INSERT INTO evidence_facts
    (id, merchant_id, source_id, predicate, status, evidence_class, source, detail, evidence_span, verifier, valid_from, valid_until, scope, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id("fact"), merchantId, sourceId, fact.predicate, fact.status, fact.evidenceClass, fact.source, fact.detail, evidenceSpan, verifier, fact.validFrom ?? null, fact.validUntil ?? null, fact.scope ?? null, new Date().toISOString());
}

function parseCsv(raw: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      if (quoted && raw[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && raw[i + 1] === '\n') i++;
      row.push(cell.trim()); cell = "";
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows.slice(0, 500);
}

export async function ingestEvidenceFile(file: File, merchantId: string) {
  const name = safeOriginalName(file.name);
  const extension = extname(name).toLowerCase();
  const allowedMimes = allowed.get(extension);
  if (!allowedMimes || !allowedMimes.has(file.type || "application/octet-stream")) throw new Error("UNSUPPORTED_EVIDENCE_FILE_TYPE");
  if (file.size <= 0 || file.size > MAX_BYTES) throw new Error("EVIDENCE_FILE_SIZE_REJECTED");

  const bytes = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  const sourceId = id("source");
  const storedName = `${sourceId}${extension}`;
  const uploadDir = process.env.VERCEL === "1" ? "/tmp/razorprocure/uploads" : resolve(process.cwd(), ".data", "uploads");
  mkdirSync(uploadDir, { recursive: true });
  writeFileSync(resolve(uploadDir, storedName), bytes, { flag: "wx" });
  db.prepare(`INSERT INTO evidence_sources (id, merchant_id, original_name, stored_name, mime_type, size_bytes, sha256, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'STORED', ?)`)
    .run(sourceId, merchantId, name, storedName, file.type, file.size, hash, new Date().toISOString());

  const textual = extension === ".pdf" ? bytes.toString("latin1") : extension === ".csv" ? bytes.toString("utf8") : "";
  const promptInjectionDetected = Boolean(textual && injectionPattern.test(textual));
  if (promptInjectionDetected) {
    audit({ eventType: "PROMPT_INJECTION_DETECTED", actor: "EVIDENCE_INGESTION", severity: "WARN", detail: "Untrusted instructions were detected in uploaded merchant evidence. Instructions were ignored; only deterministic predicate verifiers may change authority state.", metadata: { sourceId, sha256: hash } });
  }

  const facts: EvidenceFact[] = [];
  if (extension === ".pdf") {
    const fields = parseFscFieldsFromText(textual);
    if (fields.validFrom && fields.validUntil && fields.scope) {
      const fact = verifyFscCertificate({ source: name, validFrom: fields.validFrom, validUntil: fields.validUntil, scope: fields.scope, requiredScope: "BX-series" });
      facts.push(fact);
      saveFact(merchantId, sourceId, fact, `Valid From: ${fields.validFrom}; Valid Until: ${fields.validUntil}; Scope: ${fields.scope}`, "FSC_VALIDITY_SCOPE_V1");
    } else {
      const fact: EvidenceFact = { predicate: "UNCLASSIFIED_DOCUMENT", status: "UNVERIFIED", evidenceClass: "HISTORICAL_EVENT", source: name, detail: "PDF stored safely, but no configured deterministic current-authority predicate could be established." };
      facts.push(fact); saveFact(merchantId, sourceId, fact, null, "NO_AUTHORITY_MATCH");
    }
  } else if (extension === ".csv") {
    const rows = parseCsv(textual);
    const headers = (rows[0] ?? []).map((x) => x.toLowerCase());
    const idx = (key: string) => headers.indexOf(key);
    for (const r of rows.slice(1, 51)) {
      const pred = idx("predicate") >= 0 ? r[idx("predicate")] : "";
      if (pred === "FSC_CERTIFIED") {
        const vf = idx("valid_from") >= 0 ? r[idx("valid_from")] : "";
        const vu = idx("valid_until") >= 0 ? r[idx("valid_until")] : "";
        const scope = idx("scope") >= 0 ? r[idx("scope")] : "";
        if (vf && vu && scope) {
          const fact = verifyFscCertificate({ source: name, validFrom: vf, validUntil: vu, scope, requiredScope: "BX-series" });
          facts.push(fact); saveFact(merchantId, sourceId, fact, `CSV row: ${r.join(", ")}`.slice(0, 1000), "FSC_VALIDITY_SCOPE_V1");
        }
      }
    }
    if (!facts.length) {
      const fact: EvidenceFact = { predicate: "UNCLASSIFIED_DATA", status: "UNVERIFIED", evidenceClass: "HISTORICAL_EVENT", source: name, detail: "CSV stored and schema-checked, but it does not contain a configured current-authority predicate." };
      facts.push(fact); saveFact(merchantId, sourceId, fact, null, "NO_AUTHORITY_MATCH");
    }
  } else {
    const fact: EvidenceFact = { predicate: "UNCLASSIFIED_ATTACHMENT", status: "UNVERIFIED", evidenceClass: "HISTORICAL_EVENT", source: name, detail: `${extension.toUpperCase().slice(1)} source stored safely. No local deterministic extractor is allowed to promote it to current authority without a configured predicate verifier.` };
    facts.push(fact); saveFact(merchantId, sourceId, fact, null, "STORAGE_ONLY_SAFE_DEFAULT");
  }

  db.prepare("UPDATE evidence_sources SET status='PARSED' WHERE id=?").run(sourceId);
  audit({ eventType: "EVIDENCE_SOURCE_INGESTED", actor: "EVIDENCE_INGESTION", severity: facts.some((f) => f.status === "VERIFIED_CURRENT") ? "SUCCESS" : "INFO", detail: "Merchant evidence was stored with a content hash and evaluated only by configured deterministic authority rules.", metadata: { sourceId, originalName: name, mimeType: file.type, sizeBytes: file.size, sha256: hash, promptInjectionDetected, factStatuses: facts.map((f) => `${f.predicate}:${f.status}`) } });
  return { sourceId, originalName: name, mimeType: file.type, sizeBytes: file.size, sha256: hash, promptInjectionDetected, facts };
}
