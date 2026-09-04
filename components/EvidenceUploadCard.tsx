"use client";
import { useRef, useState } from "react";
import { FileCheck2, Loader2, ShieldAlert, Upload } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

type UploadResult = {
  sourceId: string;
  originalName: string;
  sha256: string;
  promptInjectionDetected: boolean;
  facts: Array<{ predicate: string; status: string; evidenceClass: string; detail: string; validFrom?: string; validUntil?: string; scope?: string }>;
};

export function EvidenceUploadCard() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function verifyFile(targetFile:File) {
    const body = new FormData(); body.append("file", targetFile);
    const response = await fetch("/api/evidence/upload", { method: "POST", body });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error || "Evidence upload failed");
    setResult(json);
  }
  async function run(targetFile:File) {
    setBusy(true); setError(""); setResult(null);
    try { await verifyFile(targetFile); }
    catch (e) { setError(e instanceof Error ? e.message : "Evidence upload failed"); }
    finally { setBusy(false); }
  }
  async function tryDemoCertificate() {
    setBusy(true); setError(""); setResult(null);
    try {
      const response=await fetch("/demo/FSC_Certificate_2026.pdf");
      if(!response.ok)throw new Error("Demo certificate is unavailable.");
      const demoFile=new File([await response.blob()],"FSC_Certificate_2026.pdf",{type:"application/pdf"});
      setFile(demoFile);
      await verifyFile(demoFile);
    } catch(e) { setError(e instanceof Error?e.message:"Evidence upload failed"); }
    finally { setBusy(false); }
  }
  return <details className="panel evidence-uploader" id="merchant-truth-panel">
    <summary><span><Upload size={14}/> Merchant Truth</span><StatusBadge tone="neutral">PDF · CSV · XLSX · image</StatusBadge></summary>
    <div className="panel-body evidence-upload-body">
      <div><div className="panel-title">Verify merchant evidence</div><p>Upload a current certificate or merchant data file. Only deterministic verifiers can promote a fact to <span className="mono">VERIFIED_CURRENT</span>.</p></div>
      <div className="upload-row"><input ref={input} type="file" accept=".pdf,.csv,.xlsx,.png,.jpg,.jpeg,.webp" onChange={(e: React.ChangeEvent<HTMLInputElement>)=>setFile(e.target.files?.[0] ?? null)}/><button className="button secondary" onClick={()=>file&&void run(file)} disabled={!file||busy}>{busy?<Loader2 size={13} style={{animation:"spin 1s linear infinite"}}/>:<FileCheck2 size={13}/>}Verify file</button><button className="button" onClick={()=>void tryDemoCertificate()} disabled={busy}>Try demo certificate</button></div>
      {error&&<div className="decision-box block" style={{margin:0}}><div className="decision-title">Evidence rejected</div><p>{error}</p></div>}
      {result&&<div className="evidence-result"><div className="evidence-result-head"><div><strong>{result.originalName}</strong><span className="mono">sha256:{result.sha256.slice(0,16)}…</span></div>{result.promptInjectionDetected?<StatusBadge tone="warning"><ShieldAlert size={10}/> untrusted instruction ignored</StatusBadge>:<StatusBadge tone="success">content hashed</StatusBadge>}</div>{result.facts.map((fact: UploadResult["facts"][number],index:number)=><div className="opp" key={`${fact.predicate}-${index}`}><div><h3>{fact.predicate}</h3><p>{fact.detail}</p>{fact.validFrom&&<p className="mono">{fact.validFrom} → {fact.validUntil} · {fact.scope}</p>}</div><StatusBadge tone={fact.status==="VERIFIED_CURRENT"?"success":fact.status==="UNKNOWN"?"warning":"neutral"}>{fact.status}</StatusBadge></div>)}</div>}
    </div>
  </details>;
}
