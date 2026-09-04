import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireApiSession } from "@/lib/auth";
import { enforceSameOrigin, publicApiError } from "@/lib/security";
import { extractInvoiceWithOpenRouter } from "@/lib/openrouter";
import { BUNDLED_DEMO_INVOICE_SHA256, bundledDemoInvoice } from "@/lib/demoInvoice";
import { saveExtractedInvoice, procurementOverview } from "@/lib/procurement";
import { audit } from "@/lib/audit";

export const runtime="nodejs";
export async function POST(request:Request){
  try{
    enforceSameOrigin(request);
    const session=await requireApiSession();
    const form=await request.formData();
    const file=form.get("file");
    if(!(file instanceof File))return NextResponse.json({error:"Invoice image or PDF required."},{status:400});
    if(file.size>8*1024*1024)return NextResponse.json({error:"Invoice file must be 8MB or smaller."},{status:413});
    const allowed=new Set(["image/png","image/jpeg","image/webp","application/pdf"]);
    if(!allowed.has(file.type))return NextResponse.json({error:"Use PNG, JPG, WEBP or PDF."},{status:415});
    const bytes=Buffer.from(await file.arrayBuffer());
    const sha256=createHash("sha256").update(bytes).digest("hex");
    const clone=new File([bytes],file.name,{type:file.type});
    const isBundledDemo=sha256===BUNDLED_DEMO_INVOICE_SHA256;
    audit({eventType:"INVOICE_EXTRACTION_STARTED",actor:"INVOICE_INTELLIGENCE",severity:"INFO",detail:isBundledDemo?"Verified bundled demo invoice selected for deterministic extraction.":"Invoice sent to the configured language layer for extraction only. Financial authority remains deterministic.",metadata:{fileName:file.name,mime:file.type,size:file.size,sha256,mode:isBundledDemo?"BUNDLED_DEMO":"OPENROUTER"}});
    const extracted=isBundledDemo?bundledDemoInvoice():await extractInvoiceWithOpenRouter(clone);
    const saved=saveExtractedInvoice(session.merchantId,extracted,file.name,sha256);
    return NextResponse.json({ok:true,sha256,...saved,extractionMode:isBundledDemo?"BUNDLED_DEMO":"OPENROUTER",extracted,overview:procurementOverview(session.merchantId)},{headers:{"cache-control":"no-store"}});
  }catch(error){
    const raw=error instanceof Error?error.message:"";
    const message=publicApiError(error,"Invoice extraction failed safely.");
    return NextResponse.json({error:message},{status:raw.includes("NOT_CONFIGURED")?503:400});
  }
}
