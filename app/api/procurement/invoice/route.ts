import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { requireApiSession } from "@/lib/auth";
import { enforceSameOrigin, publicApiError } from "@/lib/security";
import { extractInvoiceWithOpenRouter } from "@/lib/openrouter";
import { BUNDLED_DEMO_INVOICE_SHA256, bundledDemoInvoice } from "@/lib/demoInvoice";
import { saveExtractedInvoice, procurementOverview } from "@/lib/procurement";
import { audit } from "@/lib/audit";
import { extractTabularInvoice } from "@/lib/tabularInvoice";
import { z } from "zod";

export const runtime="nodejs";
const manualSchema=z.object({supplierName:z.string().trim().min(1).max(160),invoiceDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),productName:z.string().trim().min(1).max(220),brand:z.string().trim().max(120).optional(),pack:z.string().trim().max(120).optional(),quantity:z.number().int().positive().max(100000),grossLineAmount:z.string().regex(/^\d+(?:\.\d{1,2})?$/),gstRatePercent:z.string().regex(/^\d+(?:\.\d{1,4})?$/).optional()});
export async function POST(request:Request){
  try{
    enforceSameOrigin(request);
    const session=await requireApiSession();
    if(request.headers.get("content-type")?.includes("application/json")){
      const body=manualSchema.safeParse(await request.json());
      if(!body.success)return NextResponse.json({error:"Enter a valid supplier, product, quantity, and gross line amount."},{status:400});
      const {supplierName,invoiceDate,productName,brand,pack,quantity,grossLineAmount,gstRatePercent}=body.data;
      const extracted={supplierName,invoiceDate,currency:"INR",items:[{productName,brand:brand??"",pack:pack??"",quantity,grossLineAmount,gstRatePercent:gstRatePercent??"0"}]};
      const sourceHash=createHash("sha256").update(JSON.stringify(extracted)).digest("hex");
      const saved=saveExtractedInvoice(session.merchantId,extracted,"MANUAL_PURCHASE",sourceHash);
      return NextResponse.json({ok:true,...saved,extractionMode:"MANUAL",extracted,overview:procurementOverview(session.merchantId)},{headers:{"cache-control":"no-store"}});
    }
    const form=await request.formData();
    const file=form.get("file");
    if(!(file instanceof File))return NextResponse.json({error:"Invoice file required."},{status:400});
    if(file.size>8*1024*1024)return NextResponse.json({error:"Invoice file must be 8MB or smaller."},{status:413});
    const xlsxMime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const allowed=new Set(["image/png","image/jpeg","image/webp","application/pdf","text/csv",xlsxMime]);
    if(!allowed.has(file.type))return NextResponse.json({error:"Use PNG, JPG, WEBP, PDF, CSV or XLSX."},{status:415});
    const bytes=Buffer.from(await file.arrayBuffer());
    const sha256=createHash("sha256").update(bytes).digest("hex");
    const clone=new File([bytes],file.name,{type:file.type});
    const isBundledDemo=sha256===BUNDLED_DEMO_INVOICE_SHA256;
    const isTabular=file.type==="text/csv"||file.type===xlsxMime;
    const extractionMode=isBundledDemo?"BUNDLED_DEMO":isTabular?"DETERMINISTIC_TABULAR":"OPENROUTER";
    audit({eventType:"INVOICE_EXTRACTION_STARTED",actor:"INVOICE_INTELLIGENCE",severity:"INFO",detail:isBundledDemo?"Verified bundled demo invoice selected for deterministic extraction.":isTabular?"Tabular purchase history selected for deterministic column validation.":"Invoice sent to the configured language layer for extraction only. Financial authority remains deterministic.",metadata:{fileName:file.name,mime:file.type,size:file.size,sha256,mode:extractionMode}});
    const extracted=isBundledDemo?bundledDemoInvoice():isTabular?extractTabularInvoice(bytes,file.type):await extractInvoiceWithOpenRouter(clone);
    const saved=saveExtractedInvoice(session.merchantId,extracted,file.name,sha256);
    return NextResponse.json({ok:true,sha256,...saved,extractionMode,extracted,overview:procurementOverview(session.merchantId)},{headers:{"cache-control":"no-store"}});
  }catch(error){
    const raw=error instanceof Error?error.message:"";
    const message=publicApiError(error,"Invoice extraction failed safely.");
    return NextResponse.json({error:message},{status:raw.includes("NOT_CONFIGURED")?503:400});
  }
}
