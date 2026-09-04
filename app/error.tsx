"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24,background:"var(--bg)"}}><div className="panel" style={{width:"min(460px,100%)",padding:28,textAlign:"center"}}><div style={{width:46,height:46,borderRadius:14,display:"grid",placeItems:"center",margin:"0 auto 16px",background:"var(--danger-soft)",border:"1px solid rgba(255,110,124,.17)"}}><AlertTriangle size={20} color="#ff6e7c"/></div><h1 style={{fontSize:21}}>The workspace failed closed.</h1><p style={{fontSize:11,lineHeight:1.6}}>No payment or inventory action is assumed successful after an unexpected application error. Retry the view or inspect server logs.</p><button className="button secondary" onClick={reset}><RotateCcw size={13}/>Retry safely</button></div></div>;
}
