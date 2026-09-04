import { Fingerprint, LockKeyhole, ReceiptText, ShieldCheck } from "lucide-react";
import { listAudit } from "@/lib/audit";
import { StatusBadge } from "@/components/StatusBadge";
import { AuditExplorer } from "@/components/AuditExplorer";

type AuditRow={id:string;created_at:string;event_type:string;actor:string;severity:string;detail:string;metadata:Record<string,unknown>;intent_id?:string|null;offer_id?:string|null};
export default function AuditPage(){
  const events=listAudit(200) as AuditRow[];
  const payments=events.filter(e=>/PAYMENT|RAZORPAY/.test(e.event_type)).length;
  const procurement=events.filter(e=>/PROCUREMENT|SUPPLIER|PURCHASE_MEMORY|INVOICE/.test(e.event_type)).length;
  return <>
    <div className="rp-page-title"><div><div className="rp-kicker"><Fingerprint size={18}/> AUDIT</div><h1>Every purchase has receipts.</h1><p>Search the exact decisions behind supplier selection, inventory and payment.</p></div><StatusBadge tone="success"><ShieldCheck size={14}/> Server authority</StatusBadge></div>
    <section className="authority-summary production-authority-summary"><div className="authority-lock"><LockKeyhole size={27}/><div><span>TRUST POSTURE</span><strong>Fail closed</strong><small>Unknown never becomes permission.</small></div></div><div className="authority-stat"><span><ReceiptText size={17}/> Procurement events</span><strong>{procurement}</strong><small>Latest trace</small></div><div className="authority-stat"><span><ShieldCheck size={17}/> Payment events</span><strong>{payments}</strong><small>Verified server-side</small></div><div className="authority-stat"><span><Fingerprint size={17}/> Secrets</span><strong>Redacted</strong><small>Never shown in logs</small></div></section>
    <section className="surface-panel ledger-panel"><div className="surface-head compact"><div><span className="surface-kicker">AUTHORITY LEDGER</span><h2>Decision & payment trace</h2></div></div><AuditExplorer events={events}/></section>
  </>;
}
