import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { enforceSameOrigin } from "@/lib/security";
import { optimizeProcurementBasket } from "@/lib/procurement";

const schema=z.object({lines:z.array(z.object({productKey:z.string().min(1).max(120),cases:z.number().int().positive().max(50)})).min(1).max(20)});

export async function POST(request:Request){
  try{
    enforceSameOrigin(request);
    const session=await requireApiSession();
    const parsed=schema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Enter a valid basket."},{status:400});
    return NextResponse.json(optimizeProcurementBasket(parsed.data.lines,session.merchantId),{headers:{"cache-control":"no-store"}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Basket optimization failed."},{status:400});}
}
