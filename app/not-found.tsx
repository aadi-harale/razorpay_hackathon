import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound(){return <div style={{minHeight:"100vh",display:"grid",placeItems:"center",padding:24}}><div style={{textAlign:"center"}}><div className="eyebrow">404 · not found</div><h1>That surface does not exist.</h1><p style={{fontSize:11}}>Return to the merchant control plane.</p><Link href="/overview" className="button secondary"><ArrowLeft size={13}/>Back to Overview</Link></div></div>}
