import Link from "next/link";
import { ArrowRight, GitCompareArrows, Lightbulb, PackageSearch, ShieldCheck, Sparkles, TrendingDown } from "lucide-react";
import { requireSession } from "@/lib/auth";
import { procurementOverview } from "@/lib/procurement";
import { replayDashboardData } from "@/lib/replay";
import { formatINR } from "@/lib/engines/accounting";
import { ReplayRunButton } from "@/components/ReplayRunButton";

export default async function InsightsPage(){
  const session=await requireSession();
  const p=procurementOverview(session.merchantId);
  const replay=replayDashboardData();
  const suggestions=p.memory.filter(m=>m.bestSavingPaise>0).sort((a,b)=>b.bestSavingPaise-a.bestSavingPaise);
  return <>
    <div className="rp-page-title"><div><div className="rp-kicker"><Lightbulb size={18}/> SAVINGS INSIGHTS</div><h1>Know what to change before you spend.</h1><p>Real purchase-memory savings first. Simulation sits underneath as a policy lab.</p></div><Link href="/live-buyer" className="rp-btn primary"><Sparkles size={18}/> Run Smart Buy</Link></div>

    <section className="rp-insight-hero">
      <div><span>SAVINGS AVAILABLE NOW</span><strong>{formatINR(p.potentialSavingsPaise)}</strong><small>across {suggestions.length} recurring purchase{suggestions.length===1?"":"s"}</small></div>
      <div className="rp-insight-meter"><i style={{width:`${Math.min(100,20+suggestions.length*18)}%`}}/><span>Connected supplier coverage</span></div>
      <div><PackageSearch/><span>{p.connectedSuppliers} connected suppliers</span></div>
    </section>

    <section className="rp-section-card">
      <div className="rp-section-heading"><div><span>DO THIS NEXT</span><h2>Highest-value buying actions</h2></div><small>Calculated from your actual seeded/demo purchase memory</small></div>
      <div className="rp-insight-grid">{suggestions.map((s,idx)=><article className="rp-insight-card" key={s.productKey}>
        <div className="rp-insight-num">0{idx+1}</div><div className="rp-insight-icon"><TrendingDown/></div>
        <span>SWITCH WHEN YOU REORDER</span><h3>{s.productName}</h3><p>{s.bestSupplier} currently beats your usual connected supplier on safe landed cost.</p>
        <div className="rp-insight-save"><span>Potential saving</span><strong>{formatINR(s.bestSavingPaise)}</strong></div>
        <div className="rp-insight-meta"><span>{s.daysUntilReorder===null?"Reorder pattern learning":s.daysUntilReorder<=0?"Reorder due now":`Likely needed in ~${s.daysUntilReorder} days`}</span><ShieldCheck size={16}/></div>
        <Link href="/live-buyer" className="rp-text-link">Compare now <ArrowRight size={16}/></Link>
      </article>)}</div>
    </section>

    <section className="rp-policy-lab">
      <div className="rp-policy-copy"><div className="rp-kicker"><GitCompareArrows size={17}/> SHADOWFUNNEL POLICY LAB</div><h2>Test policy before changing policy.</h2><p>The original ShadowFunnel replay engine stays underneath RazorProcure. It compares the same buyer intents under control and treatment so you can see whether a change creates real incremental contribution.</p><span>Simulation estimate · not causal proof</span><div style={{marginTop:16,display:"flex"}}><ReplayRunButton/></div></div>
      <div className="rp-policy-stats"><div><span>Control paid</span><strong>{replay.summary.controlPaid}</strong></div><div><span>Treatment paid</span><strong>{replay.summary.treatmentPaid}</strong></div><div className="accent"><span>Incremental contribution</span><strong>{formatINR(replay.summary.incrementalContributionPaise)}</strong></div><div><span>Isolated regressions</span><strong>{replay.summary.regressions}</strong></div></div>
    </section>
  </>;
}
