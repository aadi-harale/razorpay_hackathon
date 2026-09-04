"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BrainCircuit, ClipboardList, CreditCard, LayoutDashboard, LogOut, PackageSearch, Settings2, ShieldCheck, ShoppingBag, Sparkles, Store, Zap } from "lucide-react";
import { MerchantSetupDrawer } from "@/components/MerchantSetupDrawer";

const nav=[
  {href:"/overview",label:"Home",hint:"Procurement command centre",icon:LayoutDashboard},
  {href:"/funnel",label:"Purchase Memory",hint:"What your business buys",icon:BrainCircuit},
  {href:"/live-buyer",label:"Smart Buy",hint:"Compare, approve & pay",icon:ShoppingBag},
  {href:"/opportunities",label:"Savings Insights",hint:"What to change next",icon:Sparkles},
  {href:"/audit",label:"Audit",hint:"Every decision explained",icon:ClipboardList}
];

export function Shell({children}:{children:React.ReactNode}){
  const pathname=usePathname();const router=useRouter();const [setupOpen,setSetupOpen]=useState(false);
  const current=nav.find(n=>pathname.startsWith(n.href))??nav[0];
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});router.push("/login");router.refresh();}
  return <div className="rp-shell">
    <aside className="rp-sidebar">
      <div className="rp-brand"><div className="rp-brand-mark"><Zap size={23}/></div><div><strong>RazorProcure</strong><span>AI Procurement</span></div></div>
      <button className="rp-workspace" onClick={()=>setSetupOpen(true)}><div className="rp-workspace-avatar">AR</div><div><strong>Aster Retail</strong><span>Retail workspace</span></div><Settings2 size={18}/></button>
      <nav className="rp-nav">{nav.map(({href,label,hint,icon:Icon})=><Link key={href} href={href} className={pathname.startsWith(href)?"active":""}><span className="rp-nav-icon"><Icon size={20}/></span><div><strong>{label}</strong><small>{hint}</small></div></Link>)}</nav>
      <Link href="/live-buyer" className="rp-sidebar-buy"><ShoppingBag size={20}/><div><strong>Start Smart Buy</strong><span>Find the best safe supplier</span></div></Link>
      <div className="rp-sidebar-spacer"/>
      <div className="rp-kernel-card"><div><ShieldCheck size={18}/><strong>ShadowFunnel</strong><span>Safety kernel</span></div><p>Money · policy · inventory · payment</p><div className="rp-kernel-pills"><span>Deterministic</span><span>Atomic</span><span>Verified</span></div></div>
      <button className="rp-signout" onClick={logout}><LogOut size={18}/> Sign out</button>
    </aside>
    <main className="rp-main">
      <header className="rp-topbar"><div><span>{current.label}</span><strong>{current.hint}</strong></div><div className="rp-top-actions"><span className="rp-status live"><i/> AI Ready</span><span className="rp-status"><CreditCard size={16}/> Demo Payments</span><button onClick={()=>setSetupOpen(true)} className="rp-profile">AR</button></div></header>
      <div className="rp-system-strip"><span><Store/> {current.label}</span><i/><span><PackageSearch/> Connected suppliers</span><i/><span><ShieldCheck/> Server authority active</span></div>
      <div className="rp-content">{children}</div>
    </main>
    <MerchantSetupDrawer open={setupOpen} onClose={()=>setSetupOpen(false)}/>
  </div>;
}
