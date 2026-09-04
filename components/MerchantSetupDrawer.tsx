"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, X } from "lucide-react";

type Services={invoiceAI?:boolean;razorpay?:boolean;shadowFunnel?:boolean};
type Overview={connectedSuppliers?:number;recurringProducts?:number;purchaseCount?:number};
export function MerchantSetupDrawer({open,onClose}:{open:boolean;onClose:()=>void}){
  const [data,setData]=useState<{services:Services;overview:Overview}|null>(null);const [err,setErr]=useState("");
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    fetch("/api/procurement/overview",{cache:"no-store",signal:controller.signal})
      .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error||"Setup unavailable");return j})
      .then(j=>{setData(j);setErr("")})
      .catch(e=>{if(e instanceof DOMException&&e.name==="AbortError")return;setErr(e instanceof Error?e.message:"Setup unavailable")});
    return ()=>controller.abort();
  },[open]);
  if(!open)return null;
  const rows=[
    {label:"Retail workspace",ok:true,detail:"Aster Retail"},
    {label:"Purchase memory",ok:Boolean(data?.overview.purchaseCount),detail:`${data?.overview.purchaseCount??0} lines learned`},
    {label:"Supplier network",ok:Boolean(data?.overview.connectedSuppliers),detail:`${data?.overview.connectedSuppliers??0} connected`},
    {label:"Invoice AI",ok:Boolean(data?.services.invoiceAI),detail:data?.services.invoiceAI?"OpenRouter connected":"Needs API key"},
    {label:"ShadowFunnel kernel",ok:Boolean(data?.services.shadowFunnel),detail:"Policy authority active"},
    {label:"Razorpay Test Mode",ok:Boolean(data?.services.razorpay),detail:data?.services.razorpay?"Ready for checkout":"Needs test keys"},
  ];
  const ready=rows.filter(r=>r.ok).length;
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="rp-setup-drawer" onMouseDown={e=>e.stopPropagation()}>
    <div className="rp-drawer-head"><div><span>WORKSPACE READINESS</span><h2>Ready to buy?</h2></div><button onClick={onClose}><X/></button></div>
    {!data&&!err&&<div className="rp-drawer-loading"><Loader2 className="spin"/> Checking services…</div>}
    {err&&<div className="rp-inline-error">{err}</div>}
    {data&&<><div className="rp-ready-score"><div><strong>{ready}/{rows.length}</strong><span>systems ready</span></div><div><i style={{width:`${ready/rows.length*100}%`}}/></div></div>
      <div className="rp-ready-list">{rows.map(({label,ok,detail})=><div key={label} className={ok?"ok":"needs"}><span>{ok?<CheckCircle2/>:<CircleAlert/>}</span><div><strong>{label}</strong><small>{detail}</small></div></div>)}</div>
      <div className="rp-drawer-next"><span>NEXT STEP</span><strong>{data.services.razorpay&&data.services.invoiceAI?"Run a Smart Buy":"Finish the incomplete connection"}</strong><Link href="/live-buyer" onClick={onClose}>Open Smart Buy</Link></div>
    </>}
  </aside></div>;
}
