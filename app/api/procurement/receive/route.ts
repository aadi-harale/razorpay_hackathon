import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireApiSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { reconcileThreeWay } from "@/lib/reconciliation";
import { enforceSameOrigin, publicApiError, verifyServerState } from "@/lib/security";

const schema=z.object({receiptToken:z.string().min(20).max(5000),invoiceNumber:z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9._/-]+$/),receivedCases:z.number().int().min(0).max(100000),invoicedAmountPaise:z.number().int().positive().max(Number.MAX_SAFE_INTEGER)});
type ReceiptAuth={kind:string;merchantId:string;localOrderId:string;runId:string;productKey:string;cases:number;expectedAmountPaise:number;supplierName:string;exp:number};

export async function POST(request:Request){
  try{
    enforceSameOrigin(request);const session=await requireApiSession();const parsed=schema.safeParse(await request.json());
    if(!parsed.success)return NextResponse.json({error:"Enter a valid receipt and invoice."},{status:400});
    const authorization=verifyServerState<ReceiptAuth>(parsed.data.receiptToken);
    if(!authorization||authorization.kind!=="PROCUREMENT_RECEIPT"||authorization.merchantId!==session.merchantId||authorization.exp<=Date.now())return NextResponse.json({error:"Receipt authorization is invalid or expired."},{status:401});
    const local=db.prepare(`SELECT status,expected_amount_paise FROM procurement_orders WHERE id=? AND merchant_id=?`).get(authorization.localOrderId,session.merchantId) as {status:string;expected_amount_paise:number}|undefined;
    if(!local&&process.env.VERCEL!=="1")return NextResponse.json({error:"Unknown or expired paid order."},{status:404});
    if(local&&local.status!=="PAID")return NextResponse.json({error:"Only a verified paid order can be received."},{status:409});
    if(local&&local.expected_amount_paise!==authorization.expectedAmountPaise)return NextResponse.json({error:"Order amount no longer matches receipt authorization."},{status:409});
    const result=reconcileThreeWay({orderedCases:authorization.cases,receivedCases:parsed.data.receivedCases,authorizedAmountPaise:authorization.expectedAmountPaise,invoicedAmountPaise:parsed.data.invoicedAmountPaise});
    const now=new Date().toISOString();
    let receiptId:string|null=null;let duplicate=false;
    if(local){
      receiptId=`prec_${randomUUID()}`;
      const inserted=db.prepare(`INSERT OR IGNORE INTO procurement_receipts(id,merchant_id,order_id,invoice_number,ordered_cases,received_cases,authorized_amount_paise,invoiced_amount_paise,protected_value_paise,status,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(receiptId,session.merchantId,authorization.localOrderId,parsed.data.invoiceNumber,authorization.cases,parsed.data.receivedCases,authorization.expectedAmountPaise,parsed.data.invoicedAmountPaise,result.protectedValuePaise,result.status,JSON.stringify(result),now);
      duplicate=inserted.changes===0;
      if(duplicate){const existing=db.prepare(`SELECT id,detail_json,status FROM procurement_receipts WHERE order_id=? AND invoice_number=?`).get(authorization.localOrderId,parsed.data.invoiceNumber) as {id:string;detail_json:string;status:string};receiptId=existing.id;return NextResponse.json({receiptId,duplicate:true,...JSON.parse(existing.detail_json)});}
    }
    audit({eventType:result.status==="MATCHED"?"THREE_WAY_MATCH_PASSED":"DELIVERY_DISCREPANCY_BLOCKED",actor:"RECEIVING_CONTROL",severity:result.status==="MATCHED"?"SUCCESS":"BLOCK",detail:result.status==="MATCHED"?"Purchase order, received quantity and supplier invoice match exactly.":"A receipt or invoice variance was detected and blocked for review before the order can be closed.",metadata:{receiptId,orderId:authorization.localOrderId,invoiceNumber:parsed.data.invoiceNumber,productKey:authorization.productKey,supplierName:authorization.supplierName,...result,stateless:!local}});
    return NextResponse.json({receiptId,duplicate,...result,order:{id:authorization.localOrderId,productKey:authorization.productKey,supplierName:authorization.supplierName,orderedCases:authorization.cases,authorizedAmountPaise:authorization.expectedAmountPaise}});
  }catch(error){return NextResponse.json({error:publicApiError(error,"Receiving check failed safely.")},{status:400})}
}
