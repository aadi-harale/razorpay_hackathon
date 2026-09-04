"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowRight, Check, CreditCard, FileCheck2, Loader2, LockKeyhole, Play, ShieldCheck, Swords, X, Search, RotateCcw, ClipboardCheck } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { EvidenceUploadCard } from "@/components/EvidenceUploadCard";

declare global { interface Window { Razorpay?: new (options: Record<string, unknown>) => { open(): void }; } }

type Candidate = {
  id: string; label: string; description: string; buyerPasses: boolean; policyResult: string; policyReason: string; discountBps: number;
  accounting: { grossCustomerPayablePaise:number; netSalesRevenuePaise:number; economicCogsPaise:number; fulfilmentCostPaise:number; processorCostPaise:number; contributionPaise:number; contributionMargin:string };
};
type Step = { id:string; event:string; title:string; detail:string; state:"success"|"warning"|"danger"|"neutral"; timestamp:string };
type EvidenceView = { fsc: { source:string; validFrom?:string; validUntil?:string; scope?:string }; gst: { source?:string } };
type DemoResult = { offerId:string; steps:Step[]; candidates:{baseline:Candidate;minimumDiscount:Candidate;threePercent:Candidate;edge:Candidate}; evidence:EvidenceView; constraints:unknown[] };
type RaceResult = { first:"RESERVED"|"BLOCKED"; second:"RESERVED"|"BLOCKED"; remainingAvailable:number; replan:null|{route:string;grossPayablePaise:number;decision:"APPROVAL_REQUIRED";reason:string} };
type RazorpayResponse = { razorpay_payment_id:string; razorpay_order_id:string; razorpay_signature:string };
type Preflight = { intent:{quantity:number;budgetMaxPaise:number;destination:string;hardRequirements:string[]}; evaluation:{decision:string;recommended:null|{route:string;label:string;finalPayablePaise:number;contributionMargin:string;availableQty:number};hardFailures:string[];candidates:Array<{route:string;label:string;finalPayablePaise:number;contributionMargin:string;availableQty:number;offerable:boolean}>} };

const inr = (p:number) => new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",minimumFractionDigits:2}).format(p/100);
const pct = (v:string) => `${(Number(v)*100).toFixed(2)}%`;
const flagship = "Buy 20 FSC-certified corporate gift boxes under ₹8,000, deliver to Pune by Monday, GST invoice required.";

function loadRazorpay() {
  return new Promise<boolean>((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function LiveBuyerClient() {
  const [data,setData] = useState<DemoResult|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [selected,setSelected] = useState<"minimumDiscount"|"threePercent"|"edge">("edge");
  const [payment,setPayment] = useState("Not initiated");
  const [race,setRace] = useState<RaceResult|null>(null);
  const [preflightText,setPreflightText] = useState(flagship);
  const [preflight,setPreflight] = useState<Preflight|null>(null);
  const [preflightBusy,setPreflightBusy] = useState(false);

  const candidate = data?.candidates[selected];
  const selectedDecision = candidate?.policyResult === "ALLOW" ? "allow" : "block";
  const paymentVerified = payment.toLowerCase().includes("verified");

  async function runDemo() {
    setBusy(true); setError(""); setPayment("Not initiated"); setRace(null); setPreflight(null);
    try {
      const res = await fetch("/api/demo/run",{method:"POST"});
      const json = await res.json(); if(!res.ok) throw new Error(json.error||"Demo failed");
      setData(json); setSelected("edge");
    } catch(e){ setError(e instanceof Error?e.message:"Demo failed"); }
    finally{setBusy(false)}
  }

  async function resetFlow() {
    setBusy(true); setError("");
    try { await fetch("/api/demo/reset",{method:"POST"}); setData(null); setRace(null); setPreflight(null); setPayment("Not initiated"); }
    catch { setError("Reset failed"); }
    finally { setBusy(false); }
  }

  async function runPreflight() {
    setPreflightBusy(true); setError(""); setData(null); setRace(null);
    try {
      const res=await fetch("/api/buyer/preflight",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:preflightText})});
      const json=await res.json(); if(!res.ok) throw new Error(json.error||"Preflight failed");
      setPreflight(json);
    } catch(e){setError(e instanceof Error?e.message:"Preflight failed")} finally{setPreflightBusy(false)}
  }

  async function runRace() {
    setBusy(true); setError(""); setPreflight(null);
    try { const res=await fetch("/api/demo/race",{method:"POST"}); const json=await res.json(); if(!res.ok)throw new Error(json.error); setRace(json); setData(null); }
    catch(e){setError(e instanceof Error?e.message:"Race failed")} finally{setBusy(false)}
  }

  async function startCheckout() {
    if(!data) return;
    setPayment("Preparing secure checkout…"); setError("");
    try {
      const started=await fetch("/api/checkout/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({offerId:data.offerId})});
      const checkout=await started.json(); if(!started.ok)throw new Error(checkout.error||"Checkout unavailable");
      if(checkout.mode==="demo"){
        setPayment("Demo payment · verified");
        return;
      }
      const loaded=await loadRazorpay(); if(!loaded||!window.Razorpay)throw new Error("Razorpay Checkout script could not be loaded.");
      const rz=new window.Razorpay({
        key:checkout.keyId, amount:checkout.amount, currency:checkout.currency, order_id:checkout.orderId,
        name:"Aster & Co.", description:"ShadowFunnel approved BX-104 offer", theme:{color:"#7768ff"},
        handler: async (response: RazorpayResponse) => {
          setPayment("Verifying server-side…");
          const verify=await fetch("/api/checkout/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(response)});
          const result=await verify.json();
          if(!verify.ok){setPayment("Verification blocked");setError(result.error||"Verification failed");return;}
          setPayment(result.status === "PAID" ? "Captured · verified" : result.status);
        },
        modal:{ondismiss:()=>setPayment("Checkout dismissed · no fulfilment")}
      });
      setPayment("Razorpay Checkout open"); rz.open();
    } catch(e){setPayment("Not initiated");setError(e instanceof Error?e.message:"Checkout failed")}
  }

  return <>
    <div className="page-heading elevated-heading live-page-head">
      <div><div className="eyebrow"><ShieldCheck size={14}/> Buyer operations</div><h1>Safety Demo</h1><p>Run the deterministic buyer walkthrough, inspect every decision, then complete a dummy payment without connecting any external account.</p></div>
      <div className="heading-actions"><button className="button secondary" onClick={resetFlow} disabled={busy}><RotateCcw size={16}/> Reset</button><button className="button secondary" onClick={runRace} disabled={busy || Boolean(data)}><Swords size={16}/> Inventory race</button><button className="button primary hero-button" onClick={runDemo} disabled={busy}>{busy?<Loader2 size={16} className="spin"/>:<Play size={16}/>}Run full demo</button></div>
    </div>

    <div className="authority-rail workflow-authority">
      {["Understand","Verify","Replan","Reserve","Pay","Audit"].map((label,i)=><div className="authority-rail-step" key={label}><span>{String(i+1).padStart(2,"0")}</span><strong>{label}</strong>{i<5&&<ArrowRight size={15}/>}</div>)}
    </div>

    {error && <div className="safety-alert"><AlertTriangle size={20}/><div><strong>Stopped safely</strong><p>{error}</p></div><span>NO UNSAFE FALLBACK</span></div>}

    {!data && !race && <section className="buyer-workbench">
      <div className="workbench-main">
        <span className="surface-kicker">BUYER PREFLIGHT</span>
        <h2>Test any buyer request before money moves.</h2>
        <textarea value={preflightText} onChange={(e)=>setPreflightText(e.target.value)} aria-label="Buyer request"/>
        <div className="workbench-actions">
          <button className="button secondary big-button" onClick={runPreflight} disabled={preflightBusy}>{preflightBusy?<Loader2 size={17} className="spin"/>:<Search size={17}/>}Check request</button>
          <button className="button primary big-button" onClick={runDemo} disabled={busy}><Play size={17}/>Run full demo</button>
        </div>
        <small>Preflight never reserves stock or creates payment.</small>
      </div>
      <div className="workbench-result">
        {!preflight ? <><ShieldCheck size={30}/><strong>Ready for a buyer</strong><span>Use the sample request or enter your own.</span></> : <>
          <div className="preflight-status"><StatusBadge tone={preflight.evaluation.recommended?"success":"warning"}>{preflight.evaluation.decision}</StatusBadge><span>{preflight.intent.quantity} units · {preflight.intent.destination}</span></div>
          {preflight.evaluation.recommended ? <div className="preflight-win"><span>BEST SAFE ROUTE</span><strong>{preflight.evaluation.recommended.label}</strong><div><b>{inr(preflight.evaluation.recommended.finalPayablePaise)}</b><small>{pct(preflight.evaluation.recommended.contributionMargin)} contribution margin</small></div><small>{preflight.evaluation.recommended.availableQty} units available</small></div> : <div className="preflight-block"><span>NO SAFE OFFER</span><strong>{preflight.evaluation.hardFailures[0] ?? "Buyer or merchant constraint failed"}</strong></div>}
          <div className="preflight-routes">{preflight.evaluation.candidates.map((c)=><div key={c.route}><span>{c.label}</span><strong>{inr(c.finalPayablePaise)}</strong><StatusBadge tone={c.offerable?"success":"danger"}>{c.offerable?"SAFE":"BLOCK"}</StatusBadge></div>)}</div>
        </>}
      </div>
    </section>}

    {race && <section className="surface-panel race-panel">
      <div className="surface-head"><div><span className="surface-kicker">GRACEFUL FAILURE</span><h2>One reservation wins. One stops.</h2></div><StatusBadge tone="warning">No oversell</StatusBadge></div>
      <div className="race-lanes">
        <div className={`race-lane ${race.first==="RESERVED"?"win":"lose"}`}><span>BUYER A</span><div><strong>{race.first}</strong><small>20 × BX-104 · Pune</small></div>{race.first==="RESERVED"?<Check size={21}/>:<X size={21}/>}</div>
        <div className="race-gate"><LockKeyhole size={18}/><strong>ATOMIC<br/>GUARD</strong></div>
        <div className={`race-lane ${race.second==="RESERVED"?"win":"lose"}`}><span>BUYER B</span><div><strong>{race.second}</strong><small>20 × BX-104 · Pune</small></div>{race.second==="RESERVED"?<Check size={21}/>:<X size={21}/>}</div>
      </div>
      <div className="race-result"><div><span>Available</span><strong>{race.remainingAvailable} units</strong></div><div><span>Second payment</span><strong>NOT CREATED</strong></div><div><span>Oversell</span><strong>PREVENTED</strong></div></div>
      {race.replan&&<div className="safety-alert"><AlertTriangle size={20}/><div><strong>Buyer B replanned to {race.replan.route} · {inr(race.replan.grossPayablePaise)}</strong><p>{race.replan.reason}</p></div><span>{race.replan.decision}</span></div>}
    </section>}

    <div id="merchant-truth"><EvidenceUploadCard /></div>

    {data && <>
      <div className="transaction-strip production-transaction-strip">
        <div><span>OFFER</span><strong className="mono">{data.offerId.slice(0,14)}…</strong></div>
        <div><span>ROUTE</span><strong>WH-PNQ-EDGE</strong></div>
        <div><span>POLICY</span><strong className="success-text">ALLOW</strong></div>
        <div><span>PAYMENT</span><strong className={paymentVerified?"success-text":""}>{payment}</strong></div>
      </div>

      <div className="live-grid production-live-grid">
        <section className="surface-panel intent-card">
          <div className="surface-head compact"><div><span className="surface-kicker">BUYER</span><h2>Mandate</h2></div><StatusBadge tone="purple">Observed</StatusBadge></div>
          <div className="intent-quote">“{flagship}”</div>
          <div className="constraint-list">
            {[["Quantity","20","OBSERVED"],["Payable","≤ ₹8,000","OBSERVED"],["Delivery","Pune · Monday","OBSERVED"],["GST invoice","Required","VERIFIED"],["FSC","Required","VERIFIED"]].map(([l,v,s])=><div className="constraint" key={l}><div><div className="constraint-label">{l}</div><div className="constraint-value">{v}</div></div><StatusBadge tone={s==="VERIFIED"?"success":"neutral"}>{s}</StatusBadge></div>)}
          </div>
          <div className="evidence-stack compact-evidence">
            <div className="evidence-row"><div className="evidence-icon"><ShieldCheck size={17}/></div><div><span>GST</span><strong>Current merchant config</strong></div><StatusBadge tone="success">verified</StatusBadge></div>
            <div className="evidence-row"><div className="evidence-icon"><FileCheck2 size={17}/></div><div><span>FSC</span><strong>{data.evidence.fsc.source}</strong></div><StatusBadge tone="success">verified</StatusBadge></div>
          </div>
        </section>

        <section className="surface-panel decision-flow-panel">
          <div className="surface-head compact"><div><span className="surface-kicker">LIVE TRACE</span><h2>What happened</h2></div><StatusBadge tone="purple">Backend events</StatusBadge></div>
          <div className="timeline">{data.steps.map((s:Step,i:number)=><div className={`timeline-item ${s.state}`} key={s.id}><div className="timeline-rail"><span className={`timeline-dot ${s.state}`}>{i+1}</span>{i<data.steps.length-1&&<span className="timeline-line"/>}</div><div className="timeline-content"><div className="timeline-event">{s.event}</div><strong>{s.title}</strong><p>{s.detail}</p></div></div>)}</div>
        </section>

        <aside className="surface-panel inspector">
          <div className="inspector-hero"><div><span className="surface-kicker">DECISION</span><h2>Policy Inspector</h2></div><StatusBadge tone={selectedDecision==="allow"?"success":"danger"}>{candidate?.policyResult}</StatusBadge></div>
          <div className="candidate-tabs"><button className={selected==="minimumDiscount"?"active":""} onClick={()=>setSelected("minimumDiscount")}><span>01</span>Min discount</button><button className={selected==="threePercent"?"active":""} onClick={()=>setSelected("threePercent")}><span>02</span>3% discount</button><button className={selected==="edge"?"active safe":"safe"} onClick={()=>setSelected("edge")}><span>03</span>Pune route</button></div>
          {candidate && <>
            <div className="money-table"><div className="money-row hero-money"><span>Buyer pays</span><strong>{inr(candidate.accounting.grossCustomerPayablePaise)}</strong></div><div className="money-row"><span>Net revenue</span><strong>{inr(candidate.accounting.netSalesRevenuePaise)}</strong></div><div className="money-row"><span>COGS</span><strong>{inr(candidate.accounting.economicCogsPaise)}</strong></div><div className="money-row"><span>Fulfilment</span><strong>{inr(candidate.accounting.fulfilmentCostPaise)}</strong></div><div className="money-row"><span>Processor</span><strong>{inr(candidate.accounting.processorCostPaise)}</strong></div><div className="money-row"><span>Contribution</span><strong>{inr(candidate.accounting.contributionPaise)}</strong></div><div className="money-row emphasis"><span>Margin</span><strong>{pct(candidate.accounting.contributionMargin)}</strong></div><div className="money-row"><span>Floor</span><strong>23.00%</strong></div></div>
            <div className={`decision-box ${selectedDecision}`}><div className="decision-title">{candidate.policyResult==="ALLOW"?<><Check size={15}/> Safe to offer</>:<><X size={15}/> Blocked</>}</div><p>{candidate.policyReason}</p></div>
          </>}
          <div className="checkout-zone"><button className="button primary checkout-button" disabled={selected!=="edge"||paymentVerified} onClick={startCheckout}><CreditCard size={17}/>{paymentVerified?"Demo verified":"Simulate payment"}</button><div className={`payment-state ${paymentVerified?"verified":""}`}>{paymentVerified?<ShieldCheck size={16}/>:<LockKeyhole size={16}/>}<div><span>DEMO PAYMENT</span><strong>{payment}</strong></div></div></div>
        </aside>
      </div>

      {paymentVerified && <section className="completion-banner"><div><ShieldCheck size={26}/><span>DEMO TRANSACTION COMPLETE</span><strong>Dummy payment verified. Inventory committed. No external account contacted.</strong></div><div><Link className="button secondary" href="/audit"><ClipboardCheck size={17}/>Open audit</Link><Link className="button primary" href="/funnel">View funnel <ArrowRight size={17}/></Link></div></section>}
    </>}

    <div className="secure-footnote"><AlertTriangle size={13}/> Public demo mode uses dummy payments only. Razorpay Checkout and external payment APIs are not contacted.</div>
  </>;
}
