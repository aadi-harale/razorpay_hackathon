"use client";

import { useMemo, useState } from "react";
import { ArrowRight, BadgeIndianRupee, Boxes, Check, CheckCircle2, CircleAlert, CreditCard, Gauge, Loader2, PackageCheck, ReceiptText, Route, Search, ShieldAlert, ShieldCheck, ShoppingCart, Sparkles, Store, Truck, X, Zap } from "lucide-react";

type CheckState="PASS"|"FAIL"|"APPROVAL";
type Option={
  listingId:string;supplierId:string;supplierName:string;supplierRole:string;listingTitle:string;verification:string;reliability:number;gstInvoice:boolean;etaDays:number;casePricePaise:number;shippingPaise:number;grossPayablePaise:number;economicLandedPaise:number;savingsVsUsualPaise:number;availableCases:number;exactMatch:boolean;policyResult:"ALLOW"|"APPROVAL_REQUIRED"|"BLOCK";rank:number;
  checks:{budget:CheckState;delivery:CheckState;inventory:CheckState;gstInvoice:CheckState;supplier:CheckState;spendLimit:CheckState};
};
type Run={runId:string;parsed:{productKey:string;productName:string;matchStatus:"EXACT"|"HIGH_CONFIDENCE";matchReason:string;cases:number;budgetPaise:number;deadlineDays:number;requiresGstInvoice:boolean};usualCostPaise:number;recommended:Option|null;options:Option[];authority:string};
type Basket={lines:Array<{productKey:string;productName:string;cases:number;usualCostPaise:number;selected:Option}>;usualCostPaise:number;optimizedCostPaise:number;economicLandedPaise:number;savingsPaise:number;supplierAllocation:string[];policyResult:"ALLOW"|"APPROVAL_REQUIRED"};
type ReceivingResult={status:"MATCHED"|"EXCEPTION_BLOCKED";checks:{purchaseOrder:"PASS";receipt:"PASS"|"FAIL";invoice:"PASS"|"FAIL"};quantityVarianceCases:number;invoiceVariancePaise:number;protectedValuePaise:number;exceptions:string[]};
type ResilienceResult={resilienceScore:number;grade:"RESILIENT"|"GUARDED"|"FRAGILE";baseline:{supplierName:string;payablePaise:number;reliability:number};autonomyEnvelope:{safe:number;approvals:number;blocked:number;total:number};preClearedFallback:{supplierName:string;payablePaise:number;deltaPaise:number}|null;downsideAvoidedPaise:number;scenarios:Array<{id:string;title:string;trigger:string;outcome:"STABLE"|"SWITCH"|"APPROVAL_REQUIRED"|"BLOCKED";supplierName:string|null;payablePaise:number|null;deltaPaise:number|null;protectedValuePaise:number;reason:string}>};

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
  const [paid,setPaid]=useState<{paymentId:string;supplier:string;demo:boolean;procurementOrderId:string;receiptToken:string}|null>(null);
  const [basket,setBasket]=useState<Basket|null>(null);
  const [basketBusy,setBasketBusy]=useState(false);
  const [receiving,setReceiving]=useState(false);const [receivingResult,setReceivingResult]=useState<ReceivingResult|null>(null);
  const [twinBusy,setTwinBusy]=useState(false);const [twin,setTwin]=useState<ResilienceResult|null>(null);

  const best=run?.recommended??null;
  const savePct=useMemo(()=>best&&run?.usualCostPaise?Math.max(0,(best.savingsVsUsualPaise/run.usualCostPaise)*100):0,[best,run]);

  async function compare(){
    setBusy(true);setError("");setPaid(null);setReceivingResult(null);setTwin(null);setRun(null);
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
      if(j.mode==="demo"){
        setPaid({paymentId:String(j.paymentId||"demo-verified"),supplier:best.supplierName,demo:true,procurementOrderId:String(j.procurementOrderId),receiptToken:String(j.receiptToken)});
        setPaying(false);
        return;
      }
      await ensureCheckout();
      if(!window.Razorpay)throw new Error("Razorpay Checkout is unavailable.");
      const rz=new window.Razorpay({
        key:j.keyId,amount:j.amount,currency:j.currency,order_id:j.orderId,name:"RazorProcure",description:`Procurement from ${j.supplierName}`,
        theme:{color:"#6C63FF"},
        handler:async(response:Record<string,string>)=>{
          try{
            const vr=await fetch("/api/procurement/checkout/verify",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...response,authorization_token:j.authorizationToken})});
            const vj=await vr.json();if(!vr.ok)throw new Error(vj.error||"Payment verification failed");
            setPaid({paymentId:String(response.razorpay_payment_id||"verified"),supplier:best.supplierName,demo:false,procurementOrderId:String(vj.procurementOrderId),receiptToken:String(vj.receiptToken)});
          }catch(e){setError(e instanceof Error?e.message:"Payment verification failed");}
          finally{setPaying(false);}
        },
        modal:{ondismiss:()=>setPaying(false)}
      });
      rz.open();
    }catch(e){setPaying(false);setError(e instanceof Error?e.message:"Checkout failed");}
  }

  async function optimizeBasket(){
    setBasketBusy(true);setError("");setBasket(null);
    try{
      const r=await fetch("/api/procurement/basket",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({lines:[
        {productKey:"fortune-sunflower-oil-1l-case48",cases:20},
        {productKey:"maggi-masala-70g-case96",cases:1},
        {productKey:"surf-excel-matic-1kg-case24",cases:1}
      ]})});
      const j=await r.json();if(!r.ok)throw new Error(j.error||"Basket optimization failed");setBasket(j);
    }catch(e){setError(e instanceof Error?e.message:"Basket optimization failed");}finally{setBasketBusy(false);}
  }

  async function verifyDelivery(showDiscrepancy=false){
    if(!paid||!run||!best)return;setReceiving(true);setError("");setReceivingResult(null);
    try{
      const discrepantCases=run.parsed.cases>1?run.parsed.cases-1:run.parsed.cases;
      const response=await fetch("/api/procurement/receive",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({receiptToken:paid.receiptToken,invoiceNumber:`${showDiscrepancy?"VAR":"OK"}-${Date.now()}`,receivedCases:showDiscrepancy?discrepantCases:run.parsed.cases,invoicedAmountPaise:best.grossPayablePaise+(showDiscrepancy?25000:0)})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Receiving check failed");setReceivingResult(result);
    }catch(error){setError(error instanceof Error?error.message:"Receiving check failed")}finally{setReceiving(false)}
  }

  async function stressTestPlan(){
    if(!run)return;setTwinBusy(true);setError("");
    try{
      const response=await fetch("/api/procurement/resilience",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({runId:run.runId,text})});
      const result=await response.json();if(!response.ok)throw new Error(result.error||"Stress test failed");setTwin(result);
    }catch(error){setError(error instanceof Error?error.message:"Stress test failed")}finally{setTwinBusy(false)}
  }

  return <>
    <section className="rp-buy-hero">
      <div className="rp-buy-title"><div className="rp-kicker"><Sparkles size={18}/> SMART BUY</div><h1>Tell us what you need.<br/><span>We find the smartest way to buy it.</span></h1><p>Connected suppliers are compared on landed cost, stock, delivery, GST and your spend policy.</p></div>
      <div className="rp-agent-orb"><div className="rp-agent-ring r1"/><div className="rp-agent-ring r2"/><div className="rp-agent-core"><ShoppingCart size={34}/><span>BUYING AGENT</span><strong>Ready</strong></div></div>
    </section>

    <section className="rp-query-card">
      <div className="rp-query-input"><Search size={23}/><textarea value={text} onChange={e=>setText(e.target.value)} rows={2} aria-label="Procurement request"/><button className="rp-btn primary big" onClick={compare} disabled={busy}>{busy?<Loader2 className="spin" size={20}/>:<><Sparkles size={20}/> Compare & optimize</>}</button></div>
      <div className="rp-chips">{suggestions.map((s,i)=><button key={i} onClick={()=>setText(s)}>Example {i+1}</button>)}<button onClick={optimizeBasket} disabled={basketBusy}>{basketBusy?"Optimizing…":"Optimize 3-item basket"}</button><a href="/demo-lab">Open safety demo <ArrowRight size={14}/></a></div>
    </section>

    {basket&&<section className="rp-plan-panel rp-basket-panel">
      <div className="rp-panel-head"><div><span>FULL-BASKET OPTIMIZATION</span><h2>Best safe supplier allocation</h2></div><div className="rp-request-badge"><Boxes size={15}/> {basket.supplierAllocation.length} suppliers</div></div>
      <div className="rp-request-grid"><div><span>Usual basket</span><strong>{inr(basket.usualCostPaise)}</strong></div><div><span>Optimized basket</span><strong>{inr(basket.optimizedCostPaise)}</strong></div><div><span>Total savings</span><strong>{inr(basket.savingsPaise)}</strong></div><div><span>Spend policy</span><strong>{basket.policyResult.replace("_"," ")}</strong></div></div>
      <div className="rp-options-list">{basket.lines.map(line=><div className="rp-supplier-card winner" key={line.productKey}><div className="rp-supplier-rank"><Check size={18}/></div><div className="rp-supplier-main"><div className="rp-supplier-name"><strong>{line.productName}</strong></div><small>{line.cases} case · allocated to {line.selected.supplierName}</small></div><div className="rp-supplier-money"><strong>{inr(line.selected.grossPayablePaise)}</strong><span>usual {inr(line.usualCostPaise)}</span><em>Save {inr(line.selected.savingsVsUsualPaise)}</em></div><div className={`rp-policy-dot ${line.selected.policyResult.toLowerCase()}`}><Check size={16}/></div></div>)}</div>
      <div className="rp-payment-note"><ShieldCheck size={15}/> Compared against the full current usual-supplier basket. Approval is still required when the aggregate spend exceeds policy.</div>
    </section>}

    {busy&&<section className="rp-live-processing">
      <div className="rp-process-step active"><Search/><span>Matching products</span></div><i/><div className="rp-process-step active"><Store/><span>Checking suppliers</span></div><i/><div className="rp-process-step active"><BadgeIndianRupee/><span>Calculating landed cost</span></div><i/><div className="rp-process-step active"><ShieldCheck/><span>Applying policy</span></div>
    </section>}

    {error&&<div className="rp-callout danger"><CircleAlert size={20}/><div><strong>Action stopped safely</strong><span>{error}</span></div></div>}
    {paid&&<div className="rp-callout success"><CheckCircle2 size={22}/><div><strong>{paid.demo?"Demo purchase completed":"Purchase verified"}</strong><span>{paid.demo?`Dummy payment completed for ${paid.supplier}. No external account was contacted; inventory is committed.`:`Razorpay confirmed the Test Mode payment to ${paid.supplier}. Inventory is committed.`}</span></div><a href="/audit" className="rp-btn ghost">View audit <ArrowRight size={17}/></a></div>}

    {paid&&run&&best&&<section className="rp-receiving-shield">
      <div className="rp-receiving-copy"><div className="rp-kicker"><ShieldAlert size={17}/> DELIVERY DISCREPANCY SHIELD</div><h2>Prove the delivery before closing the order.</h2><p>RazorProcure checks the purchase order, physical receipt and supplier invoice with server-owned values. Exceptions stop automatically and show the money protected.</p><div><button className="rp-btn primary" onClick={()=>verifyDelivery(false)} disabled={receiving}>{receiving?<Loader2 className="spin"/>:<CheckCircle2/>} Verify exact delivery</button><button className="rp-btn ghost" onClick={()=>verifyDelivery(true)} disabled={receiving}><ShieldAlert/> Test supplier discrepancy</button></div></div>
      <div className={`rp-receiving-result ${receivingResult?.status==="EXCEPTION_BLOCKED"?"blocked":""}`}>
        {!receivingResult?<><ReceiptText/><strong>Awaiting delivery</strong><span>Ordered {run.parsed.cases} case{run.parsed.cases===1?"":"s"} · authorized {inr(best.grossPayablePaise)}</span></>:<><div className="rp-match-status"><strong>{receivingResult.status.replace("_"," ")}</strong><span>{receivingResult.status==="MATCHED"?"Order can close":"Supplier exception held for review"}</span></div><div className="rp-match-checks"><span>PO <b>{receivingResult.checks.purchaseOrder}</b></span><span>Receipt <b>{receivingResult.checks.receipt}</b></span><span>Invoice <b>{receivingResult.checks.invoice}</b></span></div><div className="rp-protected-value"><span>Value protected</span><strong>{inr(receivingResult.protectedValuePaise)}</strong></div>{receivingResult.exceptions.length>0&&<small>{receivingResult.exceptions.join(" · ")}</small>}</>}
      </div>
    </section>}

    {twin&&<section className="rp-twin-panel">
      <div className="rp-twin-head"><div><div className="rp-kicker"><Zap size={17}/> PROCUREMENT TWIN</div><h2>Stress-tested before payment.</h2><p>Four counterfactuals combine sourcing, policy, inventory and delivery constraints without changing the live plan.</p></div><div className={`rp-twin-score ${twin.grade.toLowerCase()}`}><Gauge/><strong>{twin.resilienceScore}</strong><span>{twin.grade}</span></div></div>
      <div className="rp-twin-summary"><div><span>Autonomous scenarios</span><strong>{twin.autonomyEnvelope.safe}/{twin.autonomyEnvelope.total}</strong></div><div><span>Need approval</span><strong>{twin.autonomyEnvelope.approvals}</strong></div><div><span>Hard blocked</span><strong>{twin.autonomyEnvelope.blocked}</strong></div><div><span>Downside avoided</span><strong>{inr(twin.downsideAvoidedPaise)}</strong></div></div>
      {twin.preClearedFallback&&<div className="rp-fallback-strip"><Route/><div><span>PRE-CLEARED FALLBACK</span><strong>{twin.preClearedFallback.supplierName}</strong></div><b>{twin.preClearedFallback.deltaPaise>=0?"+":"−"}{inr(Math.abs(twin.preClearedFallback.deltaPaise))}</b><small>Ready inside current authority</small></div>}
      <div className="rp-scenario-grid">{twin.scenarios.map(scenario=><article key={scenario.id} className={`rp-scenario-card ${scenario.outcome.toLowerCase()}`}><div><span>{scenario.title}</span><b>{scenario.outcome.replace("_"," ")}</b></div><p>{scenario.trigger}</p><strong>{scenario.supplierName??"No safe supplier"}</strong><small>{scenario.reason}</small>{scenario.payablePaise!==null&&<em>{inr(scenario.payablePaise)}{scenario.deltaPaise!==null&&scenario.deltaPaise!==0?` · ${scenario.deltaPaise>0?"+":"−"}${inr(Math.abs(scenario.deltaPaise))}`:""}</em>}</article>)}</div>
    </section>}

    {run&&<div className="rp-buy-layout">
      <section className="rp-plan-panel">
        <div className="rp-panel-head"><div><span>YOUR REQUEST</span><h2>{run.parsed.productName}</h2></div><div className="rp-request-badge">{run.parsed.cases} case{run.parsed.cases===1?"":"s"}</div></div>
        <div className="rp-request-grid"><div><span>Budget</span><strong>{inr(run.parsed.budgetPaise)}</strong></div><div><span>Need by</span><strong>{run.parsed.deadlineDays} days</strong></div><div><span>Product match</span><strong>{run.parsed.matchStatus.replace("_"," ")}</strong></div><div><span>Compared</span><strong>{run.options.length} suppliers</strong></div></div>
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
          <button className="rp-twin-trigger" onClick={stressTestPlan} disabled={twinBusy}>{twinBusy?<Loader2 className="spin"/>:<Zap/>}{twin?" Re-run Procurement Twin":" Stress-test this plan"}</button>
          <button className={`rp-pay-button ${best.policyResult!=="ALLOW"?"disabled":""}`} onClick={checkout} disabled={paying||best.policyResult!=="ALLOW"}>{paying?<Loader2 className="spin" size={20}/>:<CreditCard size={20}/>} {best.policyResult==="ALLOW"?`Approve demo purchase · ${inr(best.grossPayablePaise)}`:best.policyResult==="APPROVAL_REQUIRED"?"Manual approval required":"No safe purchase"}</button>
          <div className="rp-payment-note"><ShieldCheck size={15}/> Safe simulator · dummy payment only · no external account connected</div>
        </>:<div className="rp-no-plan"><CircleAlert/><strong>No safe option found</strong><span>Change the budget, deadline or supplier requirements.</span></div>}
      </aside>
    </div>}
  </>;
}
