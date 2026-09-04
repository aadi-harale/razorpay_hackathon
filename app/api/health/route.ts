import { NextResponse } from "next/server";
import { paymentMode, razorpayConfigured } from "@/lib/config";
import { durableDatabaseEnabled } from "@/lib/db";

export async function GET() {
  return NextResponse.json({ app: "razorprocure", version: "2.2.0", status: "ok", environment: "test", paymentMode: paymentMode(), externalPaymentConnected: razorpayConfigured(), storageMode: durableDatabaseEnabled()?"supabase_durable_snapshot":process.env.VERCEL==="1"?"ephemeral_sqlite":"local_sqlite", timestamp: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
