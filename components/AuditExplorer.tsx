"use client";

import { useMemo, useState } from "react";
import { Search, ShieldCheck } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";

type AuditRow = { id:string; created_at:string; event_type:string; actor:string; severity:string; detail:string; metadata:Record<string, unknown>; intent_id?:string|null; offer_id?:string|null; };
const tone = (severity:string): "success"|"danger"|"warning"|"neutral" => severity==="SUCCESS"?"success":severity==="BLOCK"?"danger":severity==="WARN"?"warning":"neutral";

export function AuditExplorer({ events }: { events: AuditRow[] }) {
  const [query,setQuery] = useState("");
  const [severity,setSeverity] = useState("ALL");
  const filtered = useMemo(() => events.filter((e) => {
    const hay = `${e.event_type} ${e.detail} ${e.actor} ${e.intent_id ?? ""} ${e.offer_id ?? ""}`.toLowerCase();
    return (severity === "ALL" || e.severity === severity) && hay.includes(query.trim().toLowerCase());
  }), [events, query, severity]);

  return <>
    <div className="audit-toolbar">
      <label className="search-box"><Search size={18}/><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search event, offer, intent…"/></label>
      <div className="filter-pills">{["ALL","SUCCESS","WARN","BLOCK"].map((s)=><button key={s} className={severity===s?"active":""} onClick={()=>setSeverity(s)}>{s}</button>)}</div>
      <strong>{filtered.length} events</strong>
    </div>
    {filtered.length===0?<div className="empty-state ledger-empty"><ShieldCheck size={28}/><strong>No matching events</strong><p>Change the search or filter.</p></div>:<div className="audit-list">{filtered.map((e,index)=><details className="audit-event audit-expand" key={e.id}>
      <summary><div className="audit-seq">{String(index+1).padStart(3,"0")}</div><div className="audit-time">{new Date(e.created_at).toLocaleTimeString("en-IN",{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"})}</div><div className="audit-type mono">{e.event_type}</div><div className="audit-detail">{e.detail}</div><div><StatusBadge tone={tone(e.severity)}>{e.severity}</StatusBadge></div></summary>
      <div className="audit-metadata"><div><span>Actor</span><strong>{e.actor}</strong></div><div><span>Event ID</span><strong className="mono">{e.id}</strong></div><div><span>Intent</span><strong className="mono">{e.intent_id ?? "—"}</strong></div><div><span>Offer</span><strong className="mono">{e.offer_id ?? "—"}</strong></div><pre>{JSON.stringify(e.metadata,null,2)}</pre></div>
    </details>)}</div>}
  </>;
}
