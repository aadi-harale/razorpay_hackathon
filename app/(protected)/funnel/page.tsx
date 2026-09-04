import Link from "next/link";
import { ArrowRight, BrainCircuit, Package, ReceiptText, Repeat2, ScanLine, TrendingDown } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { procurementOverview } from "@/lib/procurement";
import { formatINR } from "@/lib/engines/accounting";
import { InvoiceIntelligence } from "@/components/InvoiceIntelligence";

export default async function PurchaseMemoryPage(){
  const session=await requireSession();
  const o=procurementOverview(session.merchantId);
  return <>
    <div className="rp-page-title"><div><div className="rp-kicker"><BrainCircuit size={18}/> PURCHASE MEMORY</div><h1>Your business remembers every buy.</h1><p>Recurring products, reorder rhythm and supplier history—built automatically from invoices.</p></div><Link href="/live-buyer" className="rp-btn primary"><Package size={18}/> Start Smart Buy</Link></div>

    <section className="rp-memory-summary">
      <div><Repeat2/><span>Recurring products</span><strong>{o.recurringProducts}</strong></div>
      <div><ReceiptText/><span>Purchases learned</span><strong>{o.purchaseCount}</strong></div>
      <div><TrendingDown/><span>Savings visible</span><strong>{formatINR(o.potentialSavingsPaise)}</strong></div>
    </section>

    <section className="rp-section-card">
      <div className="rp-section-heading"><div><span>REORDER RADAR</span><h2>What you are likely to need next</h2></div><small>Based on intervals in purchase history</small></div>
      <div className="rp-memory-list">{o.memory.map((m,idx)=><div className="rp-memory-row" key={m.productKey}>
        <div className="rp-memory-index">{String(idx+1).padStart(2,"0")}</div>
        <div className="rp-memory-product"><strong>{m.productName}</strong><span>Last bought from {m.lastSupplier}</span></div>
        <div><span>Reorder rhythm</span><strong>{m.avgReorderDays?`${m.avgReorderDays} days`:"Learning"}</strong></div>
        <div><span>Next need</span><strong className={m.daysUntilReorder!==null&&m.daysUntilReorder<=3?"warn":""}>{m.daysUntilReorder===null?"Learning":m.daysUntilReorder<=0?"Due now":`~${m.daysUntilReorder} days`}</strong></div>
        <div><span>Better option</span><strong className="good">{m.bestSavingPaise?formatINR(m.bestSavingPaise):"—"}</strong><small>{m.bestSupplier||"No safe match"}</small></div>
        <Link href="/live-buyer" className="rp-row-action">Compare <ArrowRight size={16}/></Link>
      </div>)}</div>
    </section>

    <div className="rp-memory-bottom">
      <section className="rp-section-card">
        <div className="rp-section-heading"><div><span>RECENT PURCHASES</span><h2>History</h2></div></div>
        <div className="rp-history-list">{o.purchases.slice(0,8).map((p,idx)=><div key={`${p.product_key}-${p.purchased_at}-${idx}`}><span className="rp-history-icon"><ReceiptText/></span><div><strong>{p.product_name}</strong><span>{p.supplier_name} · {p.purchased_at}</span></div><b>{formatINR(p.gross_line_paise)}</b></div>)}</div>
      </section>
      <section className="rp-memory-side">
        <div className="rp-memory-side-visual"><ScanLine/><strong>Teach RazorProcure more</strong><span>Every invoice improves the purchase memory.</span></div>
        <InvoiceIntelligence compact/>
      </section>
    </div>
  </>;
}
