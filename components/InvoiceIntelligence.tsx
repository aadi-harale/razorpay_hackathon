"use client";

import { useRef, useState } from "react";
import { ArrowRight, CheckCircle2, FileImage, Loader2, Plus, ScanLine, ShieldCheck, Sparkles, UploadCloud, X } from "lucide-react";

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
  const [manualOpen,setManualOpen]=useState(false);
  const [manual,setManual]=useState({supplierName:"",productName:"",brand:"",pack:"",quantity:"1",grossLineAmount:"",invoiceDate:new Date().toISOString().slice(0,10)});

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

  async function saveManual(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");setResult(null);
    try{
      const res=await fetch("/api/procurement/invoice",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...manual,quantity:Number(manual.quantity)})});
      const json=await res.json();if(!res.ok)throw new Error(json.error||"Manual purchase could not be saved");
      setResult({inserted:Number(json.inserted||0),accepted:Number(json.accepted||1),duplicate:Boolean(json.duplicate),extracted:json.extracted});setManualOpen(false);
    }catch(e){setError(e instanceof Error?e.message:"Manual purchase could not be saved");}finally{setBusy(false);}
  }

  return <section className={`rp-invoice ${compact?"compact":""}`}>
    <div className="rp-invoice-copy">
      <div className="rp-kicker"><ScanLine size={18}/> INVOICE INTELLIGENCE</div>
      <h2>Drop an invoice. We learn what you buy.</h2>
      {!compact && <p>AI extracts the purchase facts. RazorProcure stores the history. Money and buying decisions stay deterministic.</p>}
      <div className="rp-upload-actions">
        <button className="rp-btn primary" onClick={()=>inputRef.current?.click()} disabled={busy}>{busy?<Loader2 className="spin" size={19}/>:<UploadCloud size={19}/>} Upload invoice</button>
        <button className="rp-btn ghost" onClick={useDemo} disabled={busy}><FileImage size={18}/> Try demo invoice</button>
        <button className="rp-btn ghost" onClick={()=>setManualOpen(v=>!v)} disabled={busy}>{manualOpen?<X size={18}/>:<Plus size={18}/>} {manualOpen?"Close form":"Add manually"}</button>
        <input ref={inputRef} hidden type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{const f=e.target.files?.[0];if(f)void upload(f);}}/>
      </div>
      {manualOpen&&<form className="rp-manual-purchase" onSubmit={saveManual}>
        <label><span>Supplier</span><input required maxLength={160} value={manual.supplierName} onChange={e=>setManual({...manual,supplierName:e.target.value})}/></label>
        <label><span>Product</span><input required maxLength={220} value={manual.productName} onChange={e=>setManual({...manual,productName:e.target.value})}/></label>
        <label><span>Brand</span><input maxLength={120} value={manual.brand} onChange={e=>setManual({...manual,brand:e.target.value})}/></label>
        <label><span>Pack</span><input maxLength={120} value={manual.pack} onChange={e=>setManual({...manual,pack:e.target.value})}/></label>
        <label><span>Quantity</span><input required type="number" min="1" max="100000" value={manual.quantity} onChange={e=>setManual({...manual,quantity:e.target.value})}/></label>
        <label><span>Gross line amount (₹)</span><input required inputMode="decimal" pattern="\d+(?:\.\d{1,2})?" value={manual.grossLineAmount} onChange={e=>setManual({...manual,grossLineAmount:e.target.value})}/></label>
        <label><span>Invoice date</span><input required type="date" value={manual.invoiceDate} onChange={e=>setManual({...manual,invoiceDate:e.target.value})}/></label>
        <button className="rp-btn primary" disabled={busy}>Save purchase</button>
      </form>}
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
        <span>PNG · JPG · WEBP · PDF · CSV · XLSX · manual</span>
      </div>}
    </div>
  </section>;
}
