"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Beaker, Loader2 } from "lucide-react";

export function ReplayRunButton({ mode = "ISOLATED", count = 1000 }: { mode?: "ISOLATED"|"STATEFUL"; count?: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function run() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/replay/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode, count, seed: 20260904 }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Replay failed");
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Replay failed"); }
    finally { setBusy(false); }
  }
  return <div style={{display:"grid",gap:5,justifyItems:"end"}}><button className="button secondary" onClick={run} disabled={busy}>{busy?<Loader2 size={13} style={{animation:"spin 1s linear infinite"}}/>:<Beaker size={13}/>}Run {mode === "ISOLATED" ? "paired replay" : "stateful replay"}</button>{error&&<span className="error-text">{error}</span>}</div>;
}
