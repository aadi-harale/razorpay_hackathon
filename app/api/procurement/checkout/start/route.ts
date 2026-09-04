import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { enforceSameOrigin, publicApiError, signServerState } from "@/lib/security";
import { commitSupplierReservation, createProcurementRun, getProcurementRun, releaseSupplierReservation, reserveSupplierForRun } from "@/lib/procurement";
import { db } from "@/lib/db";
import { razorpayClient } from "@/lib/razorpay";
import { audit } from "@/lib/audit";
import { PROCUREMENT } from "@/lib/procurementConfig";
import { demoPaymentsEnabled } from "@/lib/config";

export const runtime="nodejs";
const schema=z.object({runId:z.string().min(8).max(120),text:z.string().min(3).max(1200).optional()});
export async function POST(request:Request){
  let reservationId:string|undefined; let localOrderId:string|undefined;
  try{
    enforceSameOrigin(request);
    const session=await requireApiSession();
    const body=schema.safeParse(await request.json());
    if(!body.success)return NextResponse.json({error:"Invalid procurement run."},{status:400});
    let runId=body.data.runId;
    let loaded=getProcurementRun(runId,session.merchantId);
    if(!loaded && process.env.VERCEL==="1" && body.data.text){ const recreated=createProcurementRun(body.data.text,session.merchantId); runId=recreated.runId; loaded=getProcurementRun(runId,session.merchantId); }
    if(!loaded||!loaded.selected)return NextResponse.json({error:"Procurement plan is not ready. Compare again."},{status:404});
    if(loaded.selected.policyResult!=="ALLOW")return NextResponse.json({error:loaded.selected.policyResult==="APPROVAL_REQUIRED"?"Manual approval required before this spend can proceed.":"Selected supplier offer is blocked."},{status:409});
    const existing=db.prepare(`SELECT * FROM procurement_orders WHERE run_id=? AND merchant_id=?`).get(runId,session.merchantId) as {id:string;reservation_id:string;razorpay_order_id:string|null;expected_amount_paise:number;currency:string;status:string}|undefined;
    if(existing?.status==="PAID") return NextResponse.json({error:"Procurement order is already paid."},{status:409});
    if(existing?.razorpay_order_id){
      const reservationState=db.prepare(`SELECT status,expires_at FROM supplier_reservations WHERE id=?`).get(existing.reservation_id) as {status:string;expires_at:string}|undefined;
      if(!reservationState||reservationState.status!=="ACTIVE"||new Date(reservationState.expires_at)<=new Date()) return NextResponse.json({error:"Checkout reservation expired. Recompare before paying."},{status:409});
      const authorizationToken=signServerState({kind:"PROCUREMENT_PAYMENT",merchantId:session.merchantId,razorpayOrderId:existing.razorpay_order_id,expectedAmountPaise:existing.expected_amount_paise,currency:existing.currency,supplierName:loaded.selected.supplierName,productKey:String(loaded.run.product_key),cases:Number(loaded.run.cases),exp:Date.now()+15*60*1000});
      return NextResponse.json({keyId:process.env.RAZORPAY_KEY_ID,orderId:existing.razorpay_order_id,amount:existing.expected_amount_paise,currency:existing.currency,procurementOrderId:existing.id,duplicate:true,supplierName:loaded.selected.supplierName,authorizationToken});
    }
    if(existing) return NextResponse.json({error:"A previous order creation attempt requires reconciliation. Start a fresh comparison before retrying."},{status:409});
    const reservation=reserveSupplierForRun(runId,session.merchantId); reservationId=reservation.id;
    const orderId=`pord_${randomUUID()}`; localOrderId=orderId;
    const now=new Date().toISOString();
    db.prepare(`INSERT INTO procurement_orders(id,merchant_id,run_id,reservation_id,expected_amount_paise,currency,status,created_at,updated_at) VALUES(?,?,?,?,?,?, 'CREATING',?,?)`).run(orderId,session.merchantId,runId,reservation.id,loaded.selected.grossPayablePaise,PROCUREMENT.currency,now,now);
    if(demoPaymentsEnabled()){
      const demoOrderId=`demo_order_${randomUUID()}`;
      const demoPaymentId=`demo_pay_${randomUUID()}`;
      const committed=commitSupplierReservation(reservation.id);
      const status=committed?"PAID":"RECONCILIATION_REQUIRED";
      const completedAt=new Date().toISOString();
      db.prepare(`UPDATE procurement_orders SET razorpay_order_id=?,razorpay_payment_id=?,status=?,updated_at=? WHERE id=?`).run(demoOrderId,demoPaymentId,status,completedAt,orderId);
      db.prepare(`UPDATE procurement_runs SET status=? WHERE id=?`).run(status,runId);
      if(committed){
        db.prepare(`INSERT OR IGNORE INTO retailer_purchase_lines(id,merchant_id,source,supplier_name,purchased_at,product_key,product_name,brand,pack,quantity,gross_line_paise,gst_rate,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(`paid_${demoPaymentId}`,session.merchantId,'DEMO_PAYMENT_SIMULATOR',loaded.selected.supplierName,new Date().toISOString().slice(0,10),String(loaded.run.product_key),loaded.selected.listingTitle,'','',Number(loaded.run.cases),loaded.selected.grossPayablePaise,'0',completedAt);
      }
      const receiptToken=signServerState({kind:"PROCUREMENT_RECEIPT",merchantId:session.merchantId,localOrderId:orderId,runId,productKey:String(loaded.run.product_key),cases:Number(loaded.run.cases),expectedAmountPaise:loaded.selected.grossPayablePaise,supplierName:loaded.selected.supplierName,exp:Date.now()+24*60*60*1000});
      audit({eventType:committed?"PROCUREMENT_DEMO_PAYMENT_CONFIRMED":"PROCUREMENT_RECONCILIATION_REQUIRED",actor:"DEMO_PAYMENT_SIMULATOR",severity:committed?"SUCCESS":"WARN",detail:committed?"Dummy payment completed locally, committed supplier inventory, and updated purchase memory. No external payment provider or account was contacted.":"Dummy payment completed but supplier inventory requires reconciliation. No external payment provider or account was contacted.",metadata:{runId,procurementOrderId:orderId,demoOrderId,demoPaymentId,amountPaise:loaded.selected.grossPayablePaise,supplierName:loaded.selected.supplierName,externalNetworkCall:false}});
      return NextResponse.json({mode:"demo",ok:true,status,paymentId:demoPaymentId,orderId:demoOrderId,amount:loaded.selected.grossPayablePaise,currency:PROCUREMENT.currency,procurementOrderId:orderId,supplierName:loaded.selected.supplierName,receiptToken});
    }
    const client=razorpayClient();
    const rp=await client.orders.create({amount:loaded.selected.grossPayablePaise,currency:PROCUREMENT.currency,receipt:orderId,notes:{procurement_run:runId,supplier:loaded.selected.supplierName}}) as unknown as {id:string};
    const update=db.prepare(`UPDATE procurement_orders SET razorpay_order_id=?,status='ORDER_CREATED',updated_at=? WHERE id=? AND razorpay_order_id IS NULL`).run(String(rp.id),new Date().toISOString(),orderId);
    if(update.changes!==1)throw new Error("PROCUREMENT_ORDER_BINDING_FAILED");
    db.prepare(`UPDATE procurement_runs SET status='CHECKOUT_STARTED' WHERE id=?`).run(runId);
    const authorizationToken=signServerState({kind:"PROCUREMENT_PAYMENT",merchantId:session.merchantId,razorpayOrderId:String(rp.id),expectedAmountPaise:loaded.selected.grossPayablePaise,currency:PROCUREMENT.currency,supplierName:loaded.selected.supplierName,productKey:String(loaded.run.product_key),cases:Number(loaded.run.cases),reservationId:reservation.id,localOrderId:orderId,runId,exp:Date.now()+15*60*1000});
    audit({eventType:"PROCUREMENT_RAZORPAY_ORDER_CREATED",actor:"PAYMENT_GATEWAY",severity:"SUCCESS",detail:"Razorpay Test Mode order created from the server-selected supplier plan and atomic supplier reservation.",metadata:{runId,procurementOrderId:orderId,razorpayOrderId:rp.id,amountPaise:loaded.selected.grossPayablePaise,supplierName:loaded.selected.supplierName}});
    return NextResponse.json({keyId:process.env.RAZORPAY_KEY_ID,orderId:rp.id,amount:loaded.selected.grossPayablePaise,currency:PROCUREMENT.currency,procurementOrderId:orderId,supplierName:loaded.selected.supplierName,authorizationToken});
  }catch(error){
    if(reservationId) releaseSupplierReservation(reservationId,"CHECKOUT_START_FAILED");
    if(localOrderId) try{db.prepare(`UPDATE procurement_orders SET status='ORDER_CREATE_FAILED',last_error='PROVIDER_OR_BINDING_FAILURE',updated_at=? WHERE id=?`).run(new Date().toISOString(),localOrderId)}catch{}
    return NextResponse.json({error:publicApiError(error,"Checkout could not start safely.")},{status:400});
  }
}
