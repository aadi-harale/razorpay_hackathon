import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { enforceSameOrigin } from "@/lib/security";
import { getProcurementPolicy, updateProcurementPolicy } from "@/lib/procurement";

export async function GET(){
  try{const session=await requireApiSession();return NextResponse.json(getProcurementPolicy(session.merchantId),{headers:{"cache-control":"no-store"}})}
  catch{return NextResponse.json({error:"Unauthorized"},{status:401})}
}

const schema=z.object({autonomousSpendLimitRupees:z.number().int().min(1000).max(1_000_000)});
export async function POST(request:Request){
  try{
    enforceSameOrigin(request);const session=await requireApiSession();const parsed=schema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Spend limit must be a whole-rupee value from ₹1,000 to ₹10,00,000."},{status:400});
    return NextResponse.json(updateProcurementPolicy(session.merchantId,parsed.data.autonomousSpendLimitRupees*100));
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Policy update failed."},{status:400})}
}
