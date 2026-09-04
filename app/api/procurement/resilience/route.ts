import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { compareConnectedSuppliers, createProcurementRun, getProcurementPolicy, getProcurementRun } from "@/lib/procurement";
import { analyzeProcurementResilience } from "@/lib/resilience";
import { enforceSameOrigin, publicApiError } from "@/lib/security";

const schema=z.object({runId:z.string().min(8).max(120),text:z.string().min(3).max(1200).optional()});

export async function POST(request:Request){
  try{
    enforceSameOrigin(request);const session=await requireApiSession();const parsed=schema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Enter a valid procurement run."},{status:400});
    let loaded=getProcurementRun(parsed.data.runId,session.merchantId);
    if(!loaded&&process.env.VERCEL==="1"&&parsed.data.text){const recreated=createProcurementRun(parsed.data.text,session.merchantId);loaded=getProcurementRun(recreated.runId,session.merchantId)}
    if(!loaded||!loaded.selected)return NextResponse.json({error:"Procurement plan is unavailable. Compare again."},{status:404});
    const cases=Number(loaded.run.cases);const budgetPaise=Number(loaded.run.budget_paise);const deadlineDays=Number(loaded.run.deadline_days);
    const currentOptions=compareConnectedSuppliers({productKey:String(loaded.run.product_key),cases,budgetPaise,deadlineDays,requiresGstInvoice:true},session.merchantId);
    const result=analyzeProcurementResilience({options:currentOptions,selectedListingId:loaded.selected.listingId,cases,budgetPaise,deadlineDays,spendLimitPaise:getProcurementPolicy(session.merchantId).autonomous_spend_limit_paise});
    audit({eventType:"PROCUREMENT_TWIN_STRESS_TESTED",actor:"RESILIENCE_ENGINE",severity:result.autonomyEnvelope.blocked?"WARN":"SUCCESS",detail:`Stress-tested the selected supplier across ${result.autonomyEnvelope.total} deterministic disruption scenarios before payment.`,metadata:{runId:String(loaded.run.id??parsed.data.runId),resilienceScore:result.resilienceScore,grade:result.grade,autonomyEnvelope:result.autonomyEnvelope,preClearedFallback:result.preClearedFallback,downsideAvoidedPaise:result.downsideAvoidedPaise}});
    return NextResponse.json(result,{headers:{"cache-control":"no-store"}});
  }catch(error){return NextResponse.json({error:publicApiError(error,"Resilience stress test failed safely.")},{status:400})}
}
