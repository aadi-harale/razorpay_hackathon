import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { enforceSameOrigin } from "@/lib/security";
import { createProcurementRun } from "@/lib/procurement";

const schema=z.object({text:z.string().min(3).max(1200)});
export async function POST(request:Request){
  try{
    enforceSameOrigin(request);
    const session=await requireApiSession();
    const parsed=schema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Enter a valid procurement request."},{status:400});
    return NextResponse.json(createProcurementRun(parsed.data.text,session.merchantId),{headers:{"cache-control":"no-store"}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Comparison failed."},{status:400});}
}
