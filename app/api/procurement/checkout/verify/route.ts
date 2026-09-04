import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { enforceSameOrigin, publicApiError, verifyServerState } from "@/lib/security";
import { db } from "@/lib/db";
import { verifyCheckoutSignature, razorpayClient } from "@/lib/razorpay";
import { commitSupplierReservation, getProcurementRun } from "@/lib/procurement";
import { audit } from "@/lib/audit";

export const runtime="nodejs";
const schema=z.object({razorpay_payment_id:z.string().min(5).max(120),razorpay_order_id:z.string().min(5).max(120),razorpay_signature:z.string().regex(/^[a-f0-9]+$/i).max(256),authorization_token:z.string().max(5000).optional()});
type LocalOrder={id:string;merchant_id:string;run_id:string;reservation_id:string;razorpay_order_id:string;razorpay_payment_id:string|null;expected_amount_paise:number;currency:string;status:string};
type PaymentAuth={kind:string;merchantId:string;razorpayOrderId:string;expectedAmountPaise:number;currency:string;supplierName?:string;productKey?:string;cases?:number;reservationId?:string;localOrderId?:string;runId?:string;exp:number};
export async function POST(request:Request){
  try{
    enforceSameOrigin(request);
    const session=await requireApiSession();
    const body=schema.safeParse(await request.json());
    if(!body.success)return NextResponse.json({error:"Invalid payment verification payload."},{status:400});
    const local=db.prepare(`SELECT * FROM procurement_orders WHERE razorpay_order_id=? AND merchant_id=?`).get(body.data.razorpay_order_id,session.merchantId) as LocalOrder|undefined;
    const auth=body.data.authorization_token?verifyServerState<PaymentAuth>(body.data.authorization_token):null;
    const statelessOk=process.env.VERCEL==="1" && auth?.kind==="PROCUREMENT_PAYMENT" && auth.merchantId===session.merchantId && auth.razorpayOrderId===body.data.razorpay_order_id && auth.exp>Date.now();
    if(!local&&!statelessOk)return NextResponse.json({error:"Unknown or expired procurement order."},{status:404});
    if(local?.status==="PAID"&&local.razorpay_payment_id===body.data.razorpay_payment_id)return NextResponse.json({ok:true,status:"PAID",duplicate:true});
    const storedOrderId=local?.razorpay_order_id??auth!.razorpayOrderId;
    const expectedAmount=local?.expected_amount_paise??auth!.expectedAmountPaise;
    const currency=local?.currency??auth!.currency;
    if(!verifyCheckoutSignature({storedOrderId,paymentId:body.data.razorpay_payment_id,signature:body.data.razorpay_signature}))return NextResponse.json({error:"Checkout signature verification failed."},{status:400});
    const client=razorpayClient();
    const payment=await client.payments.fetch(body.data.razorpay_payment_id) as unknown as {id:string;amount:number|string;currency:string;order_id:string;status:string;captured?:boolean};
    const order=await client.orders.fetch(storedOrderId) as unknown as {id:string;amount:number|string;currency:string;status:string};
    const amountOk=Number(payment.amount)===expectedAmount&&Number(order.amount)===expectedAmount;
    const currencyOk=String(payment.currency)===currency&&String(order.currency)===currency;
    const relationOk=String(payment.order_id)===storedOrderId&&String(order.id)===storedOrderId;
    const captured=payment.status==="captured"||payment.captured===true||order.status==="paid";
    if(!amountOk||!currencyOk||!relationOk||!captured){
      audit({eventType:"PROCUREMENT_PAYMENT_BLOCKED",actor:"PAYMENT_GATEWAY",severity:"BLOCK",detail:"Authoritative Razorpay state did not match the server-bound procurement authorization.",metadata:{orderId:local?.id??auth?.localOrderId??"stateless",amountOk,currencyOk,relationOk,captured}});
      return NextResponse.json({error:"Payment state does not satisfy procurement invariants."},{status:409});
    }
    if(!local && statelessOk){
      audit({eventType:"PROCUREMENT_PAYMENT_CAPTURED_STATELESS",actor:"PAYMENT_GATEWAY",severity:"SUCCESS",detail:"Vercel demo payment verified cryptographically and against authoritative Razorpay state. Durable inventory/audit persistence requires an external production database.",metadata:{paymentId:payment.id,razorpayOrderId:storedOrderId,amountPaise:expectedAmount,supplierName:auth?.supplierName??null}});
      return NextResponse.json({ok:true,status:"PAID",paymentId:payment.id,orderId:storedOrderId,vercelDemo:true});
    }
    const committed=commitSupplierReservation(local!.reservation_id);
    const status=committed?"PAID":"RECONCILIATION_REQUIRED";
    const now=new Date().toISOString();
    db.prepare(`UPDATE procurement_orders SET razorpay_payment_id=?,status=?,updated_at=? WHERE id=?`).run(payment.id,status,now,local!.id);
    db.prepare(`UPDATE procurement_runs SET status=? WHERE id=?`).run(committed?"PAID":"RECONCILIATION_REQUIRED",local!.run_id);
    if(committed){
      const loaded=getProcurementRun(local!.run_id,session.merchantId);
      if(loaded?.selected){
        db.prepare(`INSERT OR IGNORE INTO retailer_purchase_lines(id,merchant_id,source,supplier_name,purchased_at,product_key,product_name,brand,pack,quantity,gross_line_paise,gst_rate,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(`paid_${payment.id}`,session.merchantId,'RAZORPAY_TEST_MODE',loaded.selected.supplierName,new Date().toISOString().slice(0,10),String(loaded.run.product_key),loaded.selected.listingTitle,'','',Number(loaded.run.cases),expectedAmount,'0',now);
      }
    }
    audit({eventType:committed?"PROCUREMENT_PAYMENT_CAPTURED":"PROCUREMENT_RECONCILIATION_REQUIRED",actor:"PAYMENT_GATEWAY",severity:committed?"SUCCESS":"WARN",detail:committed?"Razorpay payment was independently verified, supplier reservation committed, and purchase memory updated.":"Payment captured after supplier reservation could not be committed; manual reconciliation required.",metadata:{runId:local!.run_id,paymentId:payment.id,razorpayOrderId:storedOrderId,amountPaise:expectedAmount,status}});
    return NextResponse.json({ok:true,status,paymentId:payment.id,orderId:storedOrderId});
  }catch(error){return NextResponse.json({error:publicApiError(error,"Payment verification failed safely.")},{status:400});}
}
