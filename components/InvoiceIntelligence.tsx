"use client";

import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2, FileImage, Loader2, ScanLine, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";

type Extracted = {
  supplierName:string;
  invoiceDate?:string;
  currency?:string;
  items:Array<{productName:string;brand?:string;pack?:string;quantity:number;grossLineAmount:string|number;gstRatePercent?:string|number}>;
};

function money(value:string|number){
  const n=typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(n) : String(value);
}

export function InvoiceIntelligence({compact=false}:{compact?:boolean}){
  const inputRef=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [result,setResult]=useState<{inserted:number;accepted:number;duplicate:boolean;extracted:Extracted}|null>(null);

  async function upload(file:File){
    setBusy(true); setError(""); setResult(null);
    try{
      const form=new FormData(); form.append("file",file,file.name);
      const res=await fetch("/api/procurement/invoice",{method:"POST",body:form});
      const json=await res.json();
      if(!res.ok) throw new Error(json.error||"Invoice extraction failed");
      setResult({inserted:Number(json.inserted||0),accepted:Number(json.accepted||json.extracted?.items?.length||0),duplicate:Boolean(json.duplicate),extracted:json.extracted});
    }catch(e){setError(e instanceof Error?e.message:"Invoice extraction failed");}
    finally{setBusy(false);}
  }

  async function useDemo(){
    setBusy(true); setError(""); setResult(null);
    try{
      const r=await fetch("/demo/sample-invoice.png");
      if(!r.ok) throw new Error("Demo invoice is unavailable.");
      const blob=await r.blob();
      await upload(new File([blob],"RazorProcure_Demo_Invoice.png",{type:"image/png"}));
    }catch(e){setError(e instanceof Error?e.message:"Could not load demo invoice");setBusy(false);}
  }

  return <section className={`rp-invoice ${compact?"compact":""}`}>
    <div className="rp-invoice-copy">
      <div className="rp-kicker"><ScanLine size={18}/> INVOICE INTELLIGENCE</div>
      <h2>Drop an invoice. We learn what you buy.</h2>
      {!compact && <p>AI extracts the purchase facts. RazorProcure stores the history. Money and buying decisions stay deterministic.</p>}
      <div className="rp-upload-actions">
        <button className="rp-btn primary" onClick={()=>inputRef.current?.click()} disabled={busy}>{busy?<Loader2 className="spin" size={19}/>:<UploadCloud size={19}/>} Upload invoice</button>
        <button className="rp-btn ghost" onClick={useDemo} disabled={busy}><FileImage size={18}/> Try demo invoice</button>
        <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);}}/>
      </div>
      <div className="rp-trust-inline"><ShieldCheck size={16}/><span>Extraction only</span><i/> <span>No AI payment authority</span></div>
      {error&&<div className="rp-inline-error">{error}</div>}
    </div>

    <div className={`rp-invoice-visual ${result?"done":""}`}>
      {busy ? <div className="rp-scan-state">
        <div className="rp-document"><div className="rp-doc-line w1"/><div className="rp-doc-line w2"/><div className="rp-doc-line w3"/><div className="rp-scan-beam"/></div>
        <div><strong>Reading purchase facts</strong><span>Supplier · products · quantities · invoice value</span></div>
      </div> : result ? <div className="rp-extract-result">
        <div className="rp-extract-head"><span><CheckCircle2 size={20}/> {result.duplicate?"Already in purchase memory":"Purchase memory updated"}</span><strong>{result.duplicate?`${result.accepted} recognized`:`${result.inserted} item${result.inserted===1?"":"s"}`}</strong></div>
        <div className="rp-extract-supplier"><span>Supplier</span><strong>{result.extracted.supplierName}</strong><small>{result.extracted.invoiceDate||"Date extracted from invoice"}</small></div>
        <div className="rp-extract-items">{result.extracted.items.slice(0,3).map((x,i)=><div key={`${x.productName}-${i}`}><div><strong>{x.productName}</strong><span>{x.pack||x.brand||"Matched purchase item"}</span></div><b>{x.quantity} ×</b><em>{money(x.grossLineAmount)}</em></div>)}</div>
        <a className="rp-text-link" href="/funnel">Open Purchase Memory <ArrowRight size={16}/></a>
      </div> : <div className="rp-empty-invoice">
        <div className="rp-floating-doc"><FileImage size={30}/><Sparkles className="spark" size={19}/></div>
        <strong>Purchase history starts here</strong>
        <span>PNG · JPG · WEBP · PDF</span>
      </div>}
    </div>
  </section>;
}
