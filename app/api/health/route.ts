import { NextResponse } from "next/server";
import { razorpayConfigured } from "@/lib/config";

export async function GET() {
  return NextResponse.json({ app: "razorprocure", version: "2.1.0", status: "ok", environment: "test", razorpayConfigured: razorpayConfigured(), timestamp: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}
