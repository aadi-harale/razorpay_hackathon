"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Loader2, X } from "lucide-react";

type Services={invoiceAI?:boolean;razorpay?:boolean;demoPayments?:boolean;shadowFunnel?:boolean};
type Overview={connectedSuppliers?:number;recurringProducts?:number;purchaseCount?:number};
export function MerchantSetupDrawer({open,onClose}:{open:boolean;onClose:()=>void}){
  const [data,setData]=useState<{services:Services;overview:Overview}|null>(null);const [err,setErr]=useState("");
  const [spendLimit,setSpendLimit]=useState("15000");const [policyVersion,setPolicyVersion]=useState(1);const [saving,setSaving]=useState(false);const [saved,setSaved]=useState(false);
  useEffect(()=>{
    if(!open)return;
    const controller=new AbortController();
    Promise.all([fetch("/api/procurement/overview",{cache:"no-store",signal:controller.signal}),fetch("/api/procurement/policy",{cache:"no-store",signal:controller.signal})])
      .then(async([overview,policy])=>{const o=await overview.json();const p=await policy.json();if(!overview.ok||!policy.ok)throw new Error(o.error||p.error||"Setup unavailable");return {o,p}})
      .then(({o,p})=>{setData(o);setSpendLimit(String(Math.round(Number(p.autonomous_spend_limit_paise)/100)));setPolicyVersion(Number(p.version));setErr("");setSaved(false)})
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
    {label:"Demo payment simulator",ok:Boolean(data?.services.demoPayments),detail:"Dummy data · no linked account"},
  ];
  const ready=rows.filter(r=>r.ok).length;
  async function savePolicy(){
    setSaving(true);setErr("");setSaved(false);
    try{const response=await fetch("/api/procurement/policy",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({autonomousSpendLimitRupees:Number(spendLimit)})});const result=await response.json();if(!response.ok)throw new Error(result.error||"Policy update failed");setPolicyVersion(Number(result.version));setSaved(true)}
    catch(error){setErr(error instanceof Error?error.message:"Policy update failed")}
    finally{setSaving(false)}
  }
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="rp-setup-drawer" onMouseDown={e=>e.stopPropagation()}>
    <div className="rp-drawer-head"><div><span>WORKSPACE READINESS</span><h2>Ready to buy?</h2></div><button onClick={onClose}><X/></button></div>
    {!data&&!err&&<div className="rp-drawer-loading"><Loader2 className="spin"/> Checking services…</div>}
    {err&&<div className="rp-inline-error">{err}</div>}
    {data&&<><div className="rp-ready-score"><div><strong>{ready}/{rows.length}</strong><span>systems ready</span></div><div><i style={{width:`${ready/rows.length*100}%`}}/></div></div>
      <div className="rp-ready-list">{rows.map(({label,ok,detail})=><div key={label} className={ok?"ok":"needs"}><span>{ok?<CheckCircle2/>:<CircleAlert/>}</span><div><strong>{label}</strong><small>{detail}</small></div></div>)}</div>
      <div className="rp-policy-control"><span>SPEND CONTROL · VERSION {policyVersion}</span><strong>Autonomous purchase limit</strong><p>Plans above this exact gross basket amount require manual approval.</p><label><span>₹</span><input type="number" min="1000" max="1000000" step="500" value={spendLimit} onChange={event=>{setSpendLimit(event.target.value);setSaved(false)}}/></label><button className="rp-btn ghost" onClick={savePolicy} disabled={saving}>{saving?<Loader2 className="spin"/>:saved?<CheckCircle2/>:null}{saving?"Saving…":saved?"Policy saved":"Save spend policy"}</button></div>
      <div className="rp-drawer-next"><span>NEXT STEP</span><strong>{data.services.demoPayments?"Run a risk-free Smart Buy":"Demo simulator unavailable"}</strong><Link href="/live-buyer" onClick={onClose}>Open Smart Buy</Link></div>
    </>}
  </aside></div>;
}
