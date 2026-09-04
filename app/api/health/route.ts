import { NextResponse } from "next/server";
import { paymentMode, razorpayConfigured } from "@/lib/config";

export async function GET() {
  return NextResponse.json({ app: "razorprocure", version: "2.1.0", status: "ok", environment: "test", paymentMode: paymentMode(), externalPaymentConnected: razorpayConfigured(), timestamp: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
