import Link from "next/link";
import { ArrowRight, BrainCircuit, CalendarClock, CircleDollarSign, CreditCard, FileUp, PackageSearch, ShieldCheck, ShoppingBag, Sparkles, Store, TrendingDown } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { procurementOverview } from "@/lib/procurement";
import { formatINR } from "@/lib/engines/accounting";
import { InvoiceIntelligence } from "@/components/InvoiceIntelligence";

export default async function OverviewPage(){
  const session=await requireSession();
  const o=procurementOverview(session.merchantId);
  const due=o.memory.filter(m=>m.daysUntilReorder!==null&&m.daysUntilReorder<=7).length;
  const next=o.memory[0];
  return <>
    <section className="rp-home-hero">
      <div className="rp-home-copy">
        <div className="rp-kicker"><Sparkles size={18}/> AI PROCUREMENT FOR RETAILERS</div>
        <h1>Buy smarter.<br/><span>Never overpay to restock.</span></h1>
        <p>RazorProcure learns from your invoices, predicts reorders, compares connected suppliers and pays only after every rule passes.</p>
        <div className="rp-hero-actions"><Link href="/live-buyer" className="rp-btn primary xl"><ShoppingBag size={20}/> Start a Smart Buy</Link><Link href="/funnel" className="rp-btn ghost xl"><BrainCircuit size={20}/> View Purchase Memory</Link></div>
        <div className="rp-hero-proof"><span><ShieldCheck/> ShadowFunnel safety</span><i/><span><CreditCard/> Razorpay Test Mode</span><i/><span><BrainCircuit/> AI invoice intelligence</span></div>
      </div>
      <div className="rp-savings-orbit">
        <div className="rp-orbit-grid"/><div className="rp-orbit-ring a"/><div className="rp-orbit-ring b"/>
        <div className="rp-orbit-card center"><span>Potential savings</span><strong>{formatINR(o.potentialSavingsPaise)}</strong><small>on your recurring buys</small></div>
        <div className="rp-orbit-mini top"><CalendarClock/><div><span>Reorders soon</span><strong>{due}</strong></div></div>
        <div className="rp-orbit-mini left"><Store/><div><span>Suppliers</span><strong>{o.connectedSuppliers}</strong></div></div>
        <div className="rp-orbit-mini right"><PackageSearch/><div><span>Products learned</span><strong>{o.recurringProducts}</strong></div></div>
        <div className="rp-orbit-flow f1"/><div className="rp-orbit-flow f2"/><div className="rp-orbit-flow f3"/>
      </div>
    </section>

    <section className="rp-metric-row">
      <div><span><CircleDollarSign/> Purchase history</span><strong>{formatINR(o.totalSpendPaise)}</strong><small>{o.purchaseCount} invoice line items analyzed</small></div>
      <div><span><TrendingDown/> Potential savings</span><strong className="good">{formatINR(o.potentialSavingsPaise)}</strong><small>from connected suppliers</small></div>
      <div><span><CalendarClock/> Reorders approaching</span><strong>{due}</strong><small>within the next 7 days</small></div>
      <div><span><ShieldCheck/> Buying authority</span><strong className="good">Protected</strong><small>server-side policy gates active</small></div>
    </section>

    {next&&<section className="rp-next-buy">
      <div className="rp-next-icon"><CalendarClock size={26}/></div>
      <div className="rp-next-copy"><span>NEXT LIKELY REORDER</span><h2>{next.productName}</h2><p>{next.avgReorderDays?`You usually reorder every ${next.avgReorderDays} days.`:"We are learning your reorder rhythm."} {next.bestSupplier?`${next.bestSupplier} is currently the best connected option.`:""}</p></div>
      <div className="rp-next-saving"><span>Possible saving</span><strong>{formatINR(next.bestSavingPaise)}</strong><small>{next.daysUntilReorder!==null?(next.daysUntilReorder<=0?"Due now":`Due in ~${next.daysUntilReorder} days`):"Pattern building"}</small></div>
      <Link href="/live-buyer" className="rp-btn primary">Review & buy <ArrowRight size={18}/></Link>
    </section>}

    <section className="rp-how-grid">
      <div className="rp-section-heading"><div><span>HOW IT WORKS</span><h2>One simple procurement loop</h2></div><small>AI assists. Deterministic code decides money.</small></div>
      <div className="rp-workflow-cards">
        <div><b>01</b><FileUp/><strong>Upload</strong><span>Invoice or purchase history</span></div>
        <i><ArrowRight/></i>
        <div><b>02</b><BrainCircuit/><strong>Learn</strong><span>Products + reorder rhythm</span></div>
        <i><ArrowRight/></i>
        <div><b>03</b><PackageSearch/><strong>Compare</strong><span>True landed cost + policy</span></div>
        <i><ArrowRight/></i>
        <div><b>04</b><CreditCard/><strong>Pay</strong><span>Approve through Razorpay</span></div>
      </div>
    </section>

    <InvoiceIntelligence/>
  </>;
}
