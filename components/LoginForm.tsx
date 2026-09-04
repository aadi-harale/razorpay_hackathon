"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, BrainCircuit, Check, CreditCard, LockKeyhole, PackageSearch, ShieldCheck, Sparkles, Zap } from "lucide-react";

export function LoginForm({defaultEmail}:{defaultEmail:string}){
  const router=useRouter();
  const [email,setEmail]=useState(defaultEmail);
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  async function submit(e:React.FormEvent){
    e.preventDefault();setBusy(true);setError("");
    try{const res=await fetch("/api/auth/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email,password})});const data=await res.json();if(!res.ok)throw new Error(data.error||"Login failed");router.push("/overview");router.refresh();}
    catch(err){setError(err instanceof Error?err.message:"Login failed");}finally{setBusy(false);}
  }
  return <div className="login-page">
    <section className="login-art">
      <div className="login-grid-overlay"/>
      <div className="login-topmark"><div className="rp-brand-mark"><Zap size={23}/></div><div><strong>RazorProcure</strong><small>AI Procurement for Retailers</small></div></div>
      <div className="login-copy">
        <div className="rp-kicker"><Sparkles size={16}/> RAZORPAY AI BUILDATHON · TRACK 01</div>
        <h1>Turn purchase history into a buying agent.</h1>
        <p>Learn recurring inventory, compare verified suppliers, optimize landed cost and complete approved purchases through Razorpay.</p>
        <div className="login-flow"><div><span>01</span><BrainCircuit size={18}/><strong>Learn</strong></div><i/><div><span>02</span><PackageSearch size={18}/><strong>Compare</strong></div><i/><div><span>03</span><ShieldCheck size={18}/><strong>Gate</strong></div><i/><div><span>04</span><CreditCard size={18}/><strong>Pay</strong></div></div>
        <div className="login-trust-list"><span><Check size={14}/> Invoice intelligence</span><span><Check size={14}/> True landed cost</span><span><Check size={14}/> Atomic supplier inventory</span><span><Check size={14}/> Server-verified Razorpay payments</span></div>
      </div>
    </section>
    <section className="login-form-wrap"><div className="login-card">
      <div className="secure-access-label"><LockKeyhole size={15}/><span>SECURE RETAIL WORKSPACE</span></div>
      <h2>Welcome back</h2><p>Use the credentials shown by <b>start.bat</b>. API keys and payment secrets stay server-side.</p>
      <form className="form" onSubmit={submit}><div className="field"><label>Retailer email</label><input autoComplete="username" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div><div className="field"><label>Password</label><input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></div>{error&&<div className="error-text">{error}</div>}<button className="button primary login-button" disabled={busy}>{busy?"Signing in…":<>Enter RazorProcure <ArrowRight size={17}/></>}</button><div className="login-hint"><ShieldCheck size={15}/><div><strong>Protected merchant session</strong><span>Every purchase, supplier reservation and payment is checked server-side.</span></div></div></form>
      <div className="login-razorpay"><span className="dot pulse-dot"/> Razorpay integration runs in Test Mode</div>
    </div></section>
  </div>;
}
