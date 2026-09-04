import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { procurementOverview } from "@/lib/procurement";
import { openRouterConfigured } from "@/lib/openrouter";
import { demoPaymentsEnabled, razorpayConfigured } from "@/lib/config";

export async function GET(){
  try{
    const session=await requireApiSession();
    return NextResponse.json({overview:procurementOverview(session.merchantId),services:{invoiceAI:openRouterConfigured(),demoPayments:demoPaymentsEnabled(),razorpay:razorpayConfigured(),shadowFunnel:true}},{headers:{"cache-control":"no-store"}});
  }catch{return NextResponse.json({error:"Unauthorized"},{status:401});}
}
