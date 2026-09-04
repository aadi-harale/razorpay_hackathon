import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { replayDashboardData } from "@/lib/replay";
import { inventorySnapshot } from "@/lib/inventory";
import { demoPaymentsEnabled, razorpayConfigured, DEMO } from "@/lib/config";
import { db } from "@/lib/db";

export async function GET() {
  try {
    await requireApiSession();
    const replay = replayDashboardData();
    const tax = db.prepare(`SELECT gst_registered, gstin, invoice_generation_enabled FROM merchant_tax_configs WHERE merchant_id=?`).get(DEMO.merchantId) as {gst_registered:number;gstin:string|null;invoice_generation_enabled:number}|undefined;
    const products = db.prepare(`SELECT COUNT(*) AS n FROM products WHERE merchant_id=? AND cost_status='VERIFIED_CURRENT'`).get(DEMO.merchantId) as {n:number};
    const locations = db.prepare(`SELECT COUNT(*) AS n FROM inventory_location WHERE merchant_id=?`).get(DEMO.merchantId) as {n:number};
    const evidence = db.prepare(`SELECT COUNT(*) AS n FROM evidence_facts WHERE merchant_id=? AND status='VERIFIED_CURRENT'`).get(DEMO.merchantId) as {n:number};
    const agentToken = process.env.AGENT_API_TOKEN ?? "";
    const readiness = {
      merchantProfile: true,
      taxAndInvoicing: Boolean(tax?.gst_registered && tax?.gstin && tax?.invoice_generation_enabled),
      catalogAndCosts: Number(products.n) > 0,
      inventory: Number(locations.n) >= 2,
      currentEvidence: Number(evidence.n) > 0,
      demoPayments: demoPaymentsEnabled(),
      razorpay: razorpayConfigured(),
      agentApi: agentToken.length >= 24 && !agentToken.includes("replace-with")
    };
    return NextResponse.json({ replay: replay.summary, opportunities: replay.opportunities, multiFixCombinations: replay.multiFixCombinations, persistedReplay: replay.persisted, inventory: inventorySnapshot(), razorpayConfigured: readiness.razorpay, readiness }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
