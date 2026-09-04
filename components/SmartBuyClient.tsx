"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BadgeIndianRupee, Check, CheckCircle2, CircleAlert, CreditCard, Loader2, PackageCheck, ReceiptText, Search, ShieldCheck, ShoppingCart, Sparkles, Store, Truck, X } from "lucide-react";

type CheckState="PASS"|"FAIL"|"APPROVAL";
type Option={
  listingId:string;supplierId:string;supplierName:string;supplierRole:string;listingTitle:string;verification:string;reliability:number;gstInvoice:boolean;etaDays:number;casePricePaise:number;shippingPaise:number;grossPayablePaise:number;economicLandedPaise:number;savingsVsUsualPaise:number;availableCases:number;exactMatch:boolean;policyResult:"ALLOW"|"APPROVAL_REQUIRED"|"BLOCK";rank:number;
  checks:{budget:CheckState;delivery:CheckState;inventory:CheckState;gstInvoice:CheckState;supplier:CheckState;spendLimit:CheckState};
};
type Run={runId:string;parsed:{productKey:string;productName:string;cases:number;budgetPaise:number;deadlineDays:number;requiresGstInvoice:boolean};usualCostPaise:number;recommended:Option|null;options:Option[];authority:string};

declare global { interface Window { Razorpay?: new(options:Record<string,unknown>)=>{open:()=>void}; } }

function inr(paise:number){return new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(paise/100)}
function StateIcon({state}:{state:CheckState}){return state==="PASS"?<Check size={14}/>:state==="APPROVAL"?<CircleAlert size={14}/>:<X size={14}/>}

async function ensureCheckout(){
  if(window.Razorpay)return;
  await new Promise<void>((resolve,reject)=>{
    const existing=document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]') as HTMLScriptElement|null;
    if(existing){existing.addEventListener("load",()=>resolve(),{once:true});existing.addEventListener("error",()=>reject(new Error("Razorpay Checkout could not load.")),{once:true});return;}
    const s=document.createElement("script");s.src="https://checkout.razorpay.com/v1/checkout.js";s.async=true;s.onload=()=>resolve();s.onerror=()=>reject(new Error("Razorpay Checkout could not load."));document.head.appendChild(s);
  });
}

const suggestions=[
  "Buy 1 case of Fortune Sunflower Oil 1L x 48 under ₹8,500 within 2 days with GST invoice",
  "Buy 1 case of Maggi Masala 70g x 96 under ₹12,500 within 2 days with GST invoice",
  "Buy 1 case of Surf Excel Matic 1kg x 24 under ₹26,000 within 2 days with GST invoice"
];

export function SmartBuyClient(){
  const [text,setText]=useState(suggestions[0]);
  const [run,setRun]=useState<Run|null>(null);
  const [busy,setBusy]=useState(false);
  const [paying,setPaying]=useState(false);
  const [error,setError]=useState("");
  const [paid,setPaid]=useState<{paymentId:string;supplier:string}|null>(null);

  const best=run?.recommended??null;
  const savePct=useMemo(()=>best&&run?.usualCostPaise?Math.max(0,(best.savingsVsUsualPaise/run.usualCostPaise)*100):0,[best,run]);

  async function compare(){
    setBusy(true);setError("");setPaid(null);setRun(null);
    try{
      const r=await fetch("/api/procurement/compare",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text})});
      const j=await r.json();if(!r.ok)throw new Error(j.error||"Comparison failed");setRun(j);
    }catch(e){setError(e instanceof Error?e.message:"Comparison failed");}finally{setBusy(false);}
  }

  async function checkout(){
    if(!run||!best||best.policyResult!=="ALLOW")return;
    setPaying(true);setError("");
    try{
      const r=await fetch("/api/procurement/checkout/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({runId:run.runId,text})});
      const j=await r.json();if(!r.ok)throw new Error(j.error||"Checkout could not start");
      await ensureCheckout();
      if(!window.Razorpay)throw new Error("Razorpay Checkout is unavailable.");
      const rz=new window.Razorpay({
        key:j.keyId,amount:j.amount,currency:j.currency,order_id:j.orderId,name:"RazorProcure",description:`Procurement from ${j.supplierName}`,
        theme:{color:"#6C63FF"},
        handler:async(response:Record<string,string>)=>{
          try{
            const vr=await fetch("/api/procurement/checkout/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...response,authorization_token:j.authorizationToken})});
            const vj=await vr.json();if(!vr.ok)throw new Error(vj.error||"Payment verification failed");
            setPaid({paymentId:String(response.razorpay_payment_id||"verified"),supplier:best.supplierName});
          }catch(e){setError(e instanceof Error?e.message:"Payment verification failed");}
          finally{setPaying(false);}
        },
        modal:{ondismiss:()=>setPaying(false)}
      });
      rz.open();
    }catch(e){setPaying(false);setError(e instanceof Error?e.message:"Checkout failed");}
  }

  return <>
    <section className="rp-buy-hero">
      <div className="rp-buy-title"><div className="rp-kicker"><Sparkles size={18}/> SMART BUY</div><h1>Tell us what you need.<br/><span>We find the smartest way to buy it.</span></h1><p>Connected suppliers are compared on landed cost, stock, delivery, GST and your spend policy.</p></div>
      <div className="rp-agent-orb"><div className="rp-agent-ring r1"/><div className="rp-agent-ring r2"/><div className="rp-agent-core"><ShoppingCart size={34}/><span>BUYING AGENT</span><strong>Ready</strong></div></div>
    </section>

    <section className="rp-query-card">
      <div className="rp-query-input"><Search size={23}/><textarea value={text} onChange={e=>setText(e.target.value)} rows={2} aria-label="Procurement request"/><button className="rp-btn primary big" onClick={compare} disabled={busy}>{busy?<Loader2 className="spin" size={20}/>:<><Sparkles size={20}/> Compare & optimize</>}</button></div>
      <div className="rp-chips">{suggestions.map((s,i)=><button key={i} onClick={()=>setText(s)}>Example {i+1}</button>)}</div>
    </section>

    {busy&&<section className="rp-live-processing">
      <div className="rp-process-step active"><Search/><span>Matching products</span></div><i/><div className="rp-process-step active"><Store/><span>Checking suppliers</span></div><i/><div className="rp-process-step active"><BadgeIndianRupee/><span>Calculating landed cost</span></div><i/><div className="rp-process-step active"><ShieldCheck/><span>Applying policy</span></div>
    </section>}

    {error&&<div className="rp-callout danger"><CircleAlert size={20}/><div><strong>Action stopped safely</strong><span>{error}</span></div></div>}
    {paid&&<div className="rp-callout success"><CheckCircle2 size={22}/><div><strong>Purchase verified</strong><span>Razorpay confirmed the payment to {paid.supplier}. Inventory is committed.</span></div><a href="/audit" className="rp-btn ghost">View audit <ArrowRight size={17}/></a></div>}

    {run&&<div className="rp-buy-layout">
      <section className="rp-plan-panel">
        <div className="rp-panel-head"><div><span>YOUR REQUEST</span><h2>{run.parsed.productName}</h2></div><div className="rp-request-badge">{run.parsed.cases} case{run.parsed.cases===1?"":"s"}</div></div>
        <div className="rp-request-grid"><div><span>Budget</span><strong>{inr(run.parsed.budgetPaise)}</strong></div><div><span>Need by</span><strong>{run.parsed.deadlineDays} days</strong></div><div><span>GST invoice</span><strong>Required</strong></div><div><span>Compared</span><strong>{run.options.length} suppliers</strong></div></div>
        <div className="rp-options-list">{run.options.map((o,idx)=><div key={o.listingId} className={`rp-supplier-card ${best?.listingId===o.listingId?"winner":""} ${o.policyResult.toLowerCase()}`}>
          <div className="rp-supplier-rank">{best?.listingId===o.listingId?<Sparkles size={18}/>:String(idx+1).padStart(2,"0")}</div>
          <div className="rp-supplier-main"><div className="rp-supplier-name"><strong>{o.supplierName}</strong>{o.supplierRole==="USUAL"&&<span>Usual</span>}{best?.listingId===o.listingId&&<b>Best safe option</b>}</div><small>{o.listingTitle}</small><div className="rp-check-row"><span className={o.checks.inventory==="PASS"?"ok":"bad"}><StateIcon state={o.checks.inventory}/> Stock</span><span className={o.checks.delivery==="PASS"?"ok":"bad"}><StateIcon state={o.checks.delivery}/> {o.etaDays}d</span><span className={o.checks.gstInvoice==="PASS"?"ok":"bad"}><StateIcon state={o.checks.gstInvoice}/> GST</span><span className={o.checks.spendLimit==="PASS"?"ok":"warn"}><StateIcon state={o.checks.spendLimit}/> Policy</span></div></div>
          <div className="rp-supplier-money"><strong>{inr(o.grossPayablePaise)}</strong><span>{o.shippingPaise?`${inr(o.shippingPaise)} delivery`:"Free delivery"}</span>{o.savingsVsUsualPaise>0&&<em>Save {inr(o.savingsVsUsualPaise)}</em>}</div>
          <div className={`rp-policy-dot ${o.policyResult.toLowerCase()}`}>{o.policyResult==="ALLOW"?<Check size={16}/>:o.policyResult==="APPROVAL_REQUIRED"?<CircleAlert size={16}/>:<X size={16}/>}</div>
        </div>)}</div>
      </section>

      <aside className="rp-checkout-panel">
        <div className="rp-checkout-glow"/>
        <div className="rp-kicker"><ShieldCheck size={17}/> SHADOWFUNNEL SAFETY KERNEL</div>
        {best?<>
          <div className="rp-best-title"><span>Recommended supplier</span><h2>{best.supplierName}</h2><p>{best.reliability}% reliability · {best.etaDays} day delivery</p></div>
          <div className="rp-saving-hero"><span>You save</span><strong>{inr(best.savingsVsUsualPaise)}</strong><small>{savePct.toFixed(1)}% vs usual supplier</small></div>
          <div className="rp-cost-stack"><div><span>Usual purchase</span><strong>{inr(run.usualCostPaise)}</strong></div><div><span>Optimized purchase</span><strong>{inr(best.grossPayablePaise)}</strong></div><div><span>Economic landed cost</span><strong>{inr(best.economicLandedPaise)}</strong></div></div>
          <div className="rp-gates">
            <div className={best.checks.budget==="PASS"?"pass":"fail"}><BadgeIndianRupee/><span>Budget</span><strong>{best.checks.budget}</strong></div>
            <div className={best.checks.delivery==="PASS"?"pass":"fail"}><Truck/><span>Delivery</span><strong>{best.checks.delivery}</strong></div>
            <div className={best.checks.inventory==="PASS"?"pass":"fail"}><PackageCheck/><span>Inventory</span><strong>{best.checks.inventory}</strong></div>
            <div className={best.checks.gstInvoice==="PASS"?"pass":"fail"}><ReceiptText/><span>GST invoice</span><strong>{best.checks.gstInvoice}</strong></div>
          </div>
          <button className={`rp-pay-button ${best.policyResult!=="ALLOW"?"disabled":""}`} onClick={checkout} disabled={paying||best.policyResult!=="ALLOW"}>{paying?<Loader2 className="spin" size={20}/>:<CreditCard size={20}/>} {best.policyResult==="ALLOW"?`Approve & Pay ${inr(best.grossPayablePaise)}`:best.policyResult==="APPROVAL_REQUIRED"?"Manual approval required":"No safe purchase"}</button>
          <div className="rp-payment-note"><ShieldCheck size={15}/> Server-created Razorpay order · Test Mode · amount cannot be changed in browser</div>
        </>:<div className="rp-no-plan"><CircleAlert/><strong>No safe option found</strong><span>Change the budget, deadline or supplier requirements.</span></div>}
      </aside>
    </div>}
  </>;
}
