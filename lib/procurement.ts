import { randomUUID } from "node:crypto";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { PROCUREMENT } from "@/lib/procurementConfig";
import { audit } from "@/lib/audit";
import { DEMO } from "@/lib/config";

export type ProcurementOption = {
  listingId:string;
  supplierId:string;
  supplierName:string;
  supplierRole:string;
  listingTitle:string;
  verification:string;
  reliability:number;
  gstInvoice:boolean;
  etaDays:number;
  casePricePaise:number;
  shippingPaise:number;
  grossPayablePaise:number;
  economicLandedPaise:number;
  savingsVsUsualPaise:number;
  availableCases:number;
  exactMatch:boolean;
  checks:{budget:"PASS"|"FAIL";delivery:"PASS"|"FAIL";inventory:"PASS"|"FAIL";gstInvoice:"PASS"|"FAIL";supplier:"PASS"|"FAIL";spendLimit:"PASS"|"APPROVAL"};
  policyResult:"ALLOW"|"APPROVAL_REQUIRED"|"BLOCK";
  rank:number;
};

type SupplierRow={id:string;name:string;verification_state:string;gst_invoice_enabled:number;reliability_score:number;eta_days:number;role:string};
type ListingRow={id:string;supplier_id:string;product_key:string;title:string;gross_case_price_paise:number;gst_rate:string;available_cases:number;reserved_cases:number;min_cases:number;shipping_paise:number;updated_at:string};

function id(prefix:string){return `${prefix}_${randomUUID()}`;}

export function getProcurementPolicy(merchantId:string){
  const row=db.prepare(`SELECT autonomous_spend_limit_paise,version,updated_at FROM merchant_procurement_policy WHERE merchant_id=?`).get(merchantId) as {autonomous_spend_limit_paise:number;version:number;updated_at:string}|undefined;
  return row??{autonomous_spend_limit_paise:PROCUREMENT.autonomousSpendLimitPaise,version:1,updated_at:null};
}

export function updateProcurementPolicy(merchantId:string,autonomousSpendLimitPaise:number){
  if(!Number.isSafeInteger(autonomousSpendLimitPaise)||autonomousSpendLimitPaise<100_000||autonomousSpendLimitPaise>100_000_000)throw new Error("PROCUREMENT_SPEND_LIMIT_INVALID");
  const now=new Date().toISOString();
  db.prepare(`INSERT INTO merchant_procurement_policy(merchant_id,autonomous_spend_limit_paise,version,updated_at) VALUES(?,?,1,?) ON CONFLICT(merchant_id) DO UPDATE SET autonomous_spend_limit_paise=excluded.autonomous_spend_limit_paise,version=merchant_procurement_policy.version+1,updated_at=excluded.updated_at`).run(merchantId,autonomousSpendLimitPaise,now);
  const policy=getProcurementPolicy(merchantId);
  audit({eventType:"PROCUREMENT_POLICY_UPDATED",actor:"MERCHANT",severity:"INFO",detail:"Merchant autonomous spend limit updated. Existing plans must be compared again before checkout.",metadata:{autonomousSpendLimitPaise:policy.autonomous_spend_limit_paise,version:policy.version}});
  return policy;
}

export type ProductMatch = {
  status:"EXACT"|"HIGH_CONFIDENCE"|"REVIEW_REQUIRED"|"NO_MATCH";
  productKey:string|null;
  reason:string;
};

export function matchProcurementProduct(text:string):ProductMatch {
  const t=text.toLowerCase().replace(/[×]/g,"x");
  if(/fortune/.test(t)){
    if(/(?:500\s*ml|2\s*l(?:itre|iter)?)/.test(t))return {status:"NO_MATCH",productKey:null,reason:"Known brand but incompatible pack size."};
    if(/sunflower|oil/.test(t)){
      const exact=/(?:1\s*l|1\s*litre|1\s*liter)/.test(t)&&/(?:x\s*48|48\s*(?:pcs|units|bottles))/i.test(t);
      return {status:exact?"EXACT":"HIGH_CONFIDENCE",productKey:"fortune-sunflower-oil-1l-case48",reason:exact?"Brand, product, unit size and case quantity match.":"Brand and product match; canonical pack confirmed from the connected catalog."};
    }
    return {status:"REVIEW_REQUIRED",productKey:null,reason:"Brand was recognized but product identity is incomplete."};
  }
  if(/maggi/.test(t)){
    if(/(?:140\s*g|280\s*g)/.test(t))return {status:"NO_MATCH",productKey:null,reason:"Known brand but incompatible pack size."};
    if(/masala|noodle/.test(t)){
      const exact=/70\s*g/.test(t)&&/(?:x\s*96|96\s*(?:pcs|units|packs))/i.test(t);
      return {status:exact?"EXACT":"HIGH_CONFIDENCE",productKey:"maggi-masala-70g-case96",reason:exact?"Brand, variant, unit size and case quantity match.":"Brand and product family match; canonical pack confirmed from the connected catalog."};
    }
    return {status:"REVIEW_REQUIRED",productKey:null,reason:"Brand was recognized but the variant is ambiguous."};
  }
  if(/surf\s*excel/.test(t)){
    if(/(?:500\s*g|2\s*kg)/.test(t))return {status:"NO_MATCH",productKey:null,reason:"Known brand but incompatible pack size."};
    if(/matic|detergent/.test(t)){
      const exact=/1\s*kg/.test(t)&&/(?:x\s*24|24\s*(?:pcs|units|packs))/i.test(t);
      return {status:exact?"EXACT":"HIGH_CONFIDENCE",productKey:"surf-excel-matic-1kg-case24",reason:exact?"Brand, variant, unit size and case quantity match.":"Brand and product family match; canonical pack confirmed from the connected catalog."};
    }
    return {status:"REVIEW_REQUIRED",productKey:null,reason:"Brand was recognized but the variant is ambiguous."};
  }
  if(/sunflower\s*oil|instant\s*noodle|matic\s*detergent/.test(t))return {status:"REVIEW_REQUIRED",productKey:null,reason:"A product category matched, but brand and pack identity require review."};
  return {status:"NO_MATCH",productKey:null,reason:"No connected catalog identity matched."};
}

export function normalizeProcurementProduct(text:string): string | null {
  const match=matchProcurementProduct(text);
  return match.status==="EXACT"||match.status==="HIGH_CONFIDENCE"?match.productKey:null;
}

function unmatchedProductKey(text:string){
  const slug=text.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,72) || "unknown";
  return `unmatched-${slug}`;
}

export function parseProcurementRequest(text:string){
  const match=matchProcurementProduct(text);
  const productKey=match.productKey;
  if(!productKey) throw new Error(match.status==="REVIEW_REQUIRED"?"PROCUREMENT_PRODUCT_REVIEW_REQUIRED":"PROCUREMENT_PRODUCT_NOT_SUPPORTED");
  const product=PROCUREMENT.products.find(p=>p.key===productKey)!;
  const caseMatch=text.match(/(\d+)\s*(?:case|carton|box)/i);
  const cases=caseMatch?Math.max(1,Math.min(50,Number(caseMatch[1]))):1;
  const budgetMatch=text.match(/(?:under|below|budget(?:\s+of)?|<=|≤)\s*₹?\s*([\d,]+)/i);
  const budgetPaise=budgetMatch?Number(budgetMatch[1].replace(/,/g,""))*100:PROCUREMENT.defaultBudgetPaise;
  const deadlineMatch=text.match(/(?:within|in)\s*(\d+)\s*day/i);
  const deadlineDays=deadlineMatch?Math.max(1,Math.min(14,Number(deadlineMatch[1]))):PROCUREMENT.defaultDeadlineDays;
  return {productKey,productName:product.name,matchStatus:match.status,matchReason:match.reason,cases,budgetPaise,deadlineDays,requiresGstInvoice:/gst|invoice/i.test(text)||PROCUREMENT.requiresGstInvoiceByDefault};
}

function economicLanded(productGrossPaise:number,productGstRate:string,shippingGrossPaise:number){
  if(!PROCUREMENT.inputGstRecoverable) return productGrossPaise+shippingGrossPaise;
  const productNet=new Decimal(productGrossPaise).div(new Decimal(1).plus(productGstRate));
  const shippingNet=new Decimal(shippingGrossPaise).div(new Decimal(1).plus(PROCUREMENT.shippingGstRate));
  return productNet.plus(shippingNet).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toNumber();
}

export function currentUsualCost(productKey:string,cases:number){
  const listing=db.prepare(`SELECT l.* FROM supplier_listings l JOIN connected_suppliers s ON s.id=l.supplier_id WHERE l.product_key=? AND s.role='USUAL' LIMIT 1`).get(productKey) as ListingRow|undefined;
  if(!listing) return 0;
  return listing.gross_case_price_paise*cases+listing.shipping_paise;
}

export function compareConnectedSuppliers(input:{productKey:string;cases:number;budgetPaise:number;deadlineDays:number;requiresGstInvoice:boolean},merchantId:string=DEMO.merchantId){
  const product=PROCUREMENT.products.find(p=>p.key===input.productKey);
  if(!product) throw new Error("PROCUREMENT_PRODUCT_NOT_SUPPORTED");
  const spendLimit=getProcurementPolicy(merchantId).autonomous_spend_limit_paise;
  const usual=currentUsualCost(input.productKey,input.cases);
  const rows=db.prepare(`SELECT l.*,s.name,s.verification_state,s.gst_invoice_enabled,s.reliability_score,s.eta_days,s.role FROM supplier_listings l JOIN connected_suppliers s ON s.id=l.supplier_id WHERE l.product_key=?`).all(input.productKey) as Array<ListingRow&SupplierRow>;
  const options:ProcurementOption[]=rows.map(row=>{
    const productGross=row.gross_case_price_paise*input.cases;
    const gross=productGross+row.shipping_paise;
    const available=Math.max(0,row.available_cases-row.reserved_cases);
    const inventoryPass=available>=input.cases&&input.cases>=row.min_cases;
    const budgetPass=gross<=input.budgetPaise;
    const deliveryPass=row.eta_days<=input.deadlineDays;
    const gstPass=!input.requiresGstInvoice||Boolean(row.gst_invoice_enabled);
    const supplierPass=row.verification_state==="VERIFIED";
    const spendApproval=gross>spendLimit;
    const hardPass=inventoryPass&&budgetPass&&deliveryPass&&gstPass&&supplierPass;
    const policyResult:ProcurementOption["policyResult"]=!hardPass?"BLOCK":spendApproval?"APPROVAL_REQUIRED":"ALLOW";
    return {
      listingId:row.id,supplierId:row.supplier_id,supplierName:row.name,supplierRole:row.role,listingTitle:row.title,verification:row.verification_state,reliability:row.reliability_score,gstInvoice:Boolean(row.gst_invoice_enabled),etaDays:row.eta_days,
      casePricePaise:row.gross_case_price_paise,shippingPaise:row.shipping_paise,grossPayablePaise:gross,economicLandedPaise:economicLanded(productGross,product.gstRate,row.shipping_paise),savingsVsUsualPaise:Math.max(0,usual-gross),availableCases:available,exactMatch:true,
      checks:{budget:budgetPass?"PASS":"FAIL",delivery:deliveryPass?"PASS":"FAIL",inventory:inventoryPass?"PASS":"FAIL",gstInvoice:gstPass?"PASS":"FAIL",supplier:supplierPass?"PASS":"FAIL",spendLimit:spendApproval?"APPROVAL":"PASS"},policyResult,rank:0
    };
  });
  return options.sort((a,b)=>{
    const pa=a.policyResult==="ALLOW"?0:a.policyResult==="APPROVAL_REQUIRED"?1:2;
    const pb=b.policyResult==="ALLOW"?0:b.policyResult==="APPROVAL_REQUIRED"?1:2;
    return pa-pb||a.economicLandedPaise-b.economicLandedPaise||b.reliability-a.reliability;
  }).map((o,i)=>({...o,rank:i+1}));
}

export function optimizeProcurementBasket(lines:Array<{productKey:string;cases:number}>,merchantId:string=DEMO.merchantId){
  if(!lines.length||lines.length>20)throw new Error("PROCUREMENT_BASKET_SIZE_INVALID");
  const planned=lines.map(line=>{
    if(!Number.isSafeInteger(line.cases)||line.cases<=0||line.cases>50)throw new Error("PROCUREMENT_BASKET_QUANTITY_INVALID");
    const product=PROCUREMENT.products.find(item=>item.key===line.productKey);
    if(!product)throw new Error("PROCUREMENT_PRODUCT_NOT_SUPPORTED");
    const options=compareConnectedSuppliers({productKey:line.productKey,cases:line.cases,budgetPaise:Number.MAX_SAFE_INTEGER,deadlineDays:7,requiresGstInvoice:true},merchantId);
    const selected=options.find(option=>option.policyResult==="ALLOW")??options.find(option=>option.policyResult==="APPROVAL_REQUIRED")??null;
    if(!selected)throw new Error("PROCUREMENT_BASKET_LINE_BLOCKED");
    return {productKey:line.productKey,productName:product.name,cases:line.cases,usualCostPaise:currentUsualCost(line.productKey,line.cases),selected};
  });
  const usualCostPaise=planned.reduce((sum,line)=>sum+line.usualCostPaise,0);
  const optimizedCostPaise=planned.reduce((sum,line)=>sum+line.selected.grossPayablePaise,0);
  const economicLandedPaise=planned.reduce((sum,line)=>sum+line.selected.economicLandedPaise,0);
  const supplierAllocation=[...new Set(planned.map(line=>line.selected.supplierName))];
  const policyResult=optimizedCostPaise>getProcurementPolicy(merchantId).autonomous_spend_limit_paise||planned.some(line=>line.selected.policyResult==="APPROVAL_REQUIRED")?"APPROVAL_REQUIRED":"ALLOW";
  const result={lines:planned,usualCostPaise,optimizedCostPaise,economicLandedPaise,savingsPaise:Math.max(0,usualCostPaise-optimizedCostPaise),supplierAllocation,policyResult};
  audit({eventType:"PROCUREMENT_BASKET_OPTIMIZED",actor:"RAZORPROCURE",severity:policyResult==="ALLOW"?"SUCCESS":"WARN",detail:`Optimized ${planned.length} basket lines across ${supplierAllocation.length} supplier(s) against the complete usual-supplier basket.`,metadata:{usualCostPaise,optimizedCostPaise,economicLandedPaise,savingsPaise:result.savingsPaise,supplierAllocation,policyResult}});
  return result;
}

export function createProcurementRun(text:string,merchantId:string){
  const parsed=parseProcurementRequest(text);
  const options=compareConnectedSuppliers(parsed,merchantId);
  const recommended=options.find(o=>o.policyResult==="ALLOW")??options.find(o=>o.policyResult==="APPROVAL_REQUIRED")??null;
  const runId=id("prun");
  const usual=currentUsualCost(parsed.productKey,parsed.cases);
  const now=new Date().toISOString();
  db.transaction(()=>{
    db.prepare(`INSERT INTO procurement_runs(id,merchant_id,raw_text,product_key,cases,budget_paise,deadline_days,status,selected_listing_id,current_cost_paise,recommended_cost_paise,savings_paise,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(runId,merchantId,text,parsed.productKey,parsed.cases,parsed.budgetPaise,parsed.deadlineDays,recommended?"READY":"BLOCKED",recommended?.listingId??null,usual,recommended?.grossPayablePaise??null,recommended?Math.max(0,usual-recommended.grossPayablePaise):0,now);
    const stmt=db.prepare(`INSERT INTO procurement_run_options(id,run_id,listing_id,landed_cost_paise,economic_landed_paise,savings_vs_usual_paise,policy_result,rank,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)`);
    for(const o of options) stmt.run(id("popt"),runId,o.listingId,o.grossPayablePaise,o.economicLandedPaise,o.savingsVsUsualPaise,o.policyResult,o.rank,JSON.stringify(o),now);
  })();
  audit({eventType:"PROCUREMENT_PLAN_CREATED",actor:"RAZORPROCURE",severity:recommended?"SUCCESS":"BLOCK",detail:recommended?`Compared ${options.length} connected supplier offers and selected the lowest safe landed-cost plan.`:"No connected supplier satisfied every retailer policy gate.",metadata:{runId,productKey:parsed.productKey,cases:parsed.cases,recommendedSupplier:recommended?.supplierName??null,savingsPaise:recommended?.savingsVsUsualPaise??0}});
  return {runId,parsed,usualCostPaise:usual,recommended,options,authority:"SHADOWFUNNEL_POLICY_KERNEL" as const};
}

export function getProcurementRun(runId:string,merchantId:string){
  const run=db.prepare(`SELECT * FROM procurement_runs WHERE id=? AND merchant_id=?`).get(runId,merchantId) as Record<string,unknown>|undefined;
  if(!run) return null;
  const rows=db.prepare(`SELECT detail_json FROM procurement_run_options WHERE run_id=? ORDER BY rank`).all(runId) as Array<{detail_json:string}>;
  const options=rows.map(r=>JSON.parse(r.detail_json) as ProcurementOption);
  const selected=options.find(o=>o.listingId===run.selected_listing_id)??null;
  return {run,options,selected};
}

export function revalidateProcurementRun(runId:string,merchantId:string){
  const loaded=getProcurementRun(runId,merchantId);
  if(!loaded||!loaded.selected) throw new Error("PROCUREMENT_RUN_NOT_READY");
  const createdAt=String(loaded.run.created_at??"");
  if(!createdAt||Date.now()-new Date(createdAt).getTime()>PROCUREMENT.planTtlSeconds*1000) throw new Error("PROCUREMENT_PLAN_EXPIRED");
  const current=compareConnectedSuppliers({
    productKey:String(loaded.run.product_key),
    cases:Number(loaded.run.cases),
    budgetPaise:Number(loaded.run.budget_paise),
    deadlineDays:Number(loaded.run.deadline_days),
    requiresGstInvoice:true
  },merchantId);
  const fresh=current.find(o=>o.listingId===loaded.selected!.listingId);
  if(!fresh||fresh.policyResult!=="ALLOW") throw new Error("PROCUREMENT_PLAN_NO_LONGER_SAFE");
  if(fresh.grossPayablePaise!==loaded.selected.grossPayablePaise) throw new Error("PROCUREMENT_PRICE_CHANGED_RECOMPARE");
  return {...loaded,selected:fresh};
}

export function reserveSupplierForRun(runId:string,merchantId:string){
  releaseExpiredSupplierReservations();
  const loaded=revalidateProcurementRun(runId,merchantId);
  const selected=loaded.selected;
  if(selected.policyResult!=="ALLOW") throw new Error(selected.policyResult==="APPROVAL_REQUIRED"?"PROCUREMENT_APPROVAL_REQUIRED":"PROCUREMENT_POLICY_BLOCKED");
  const existing=db.prepare(`SELECT * FROM supplier_reservations WHERE run_id=?`).get(runId) as {id:string;status:string;expires_at:string}|undefined;
  if(existing&&existing.status==="ACTIVE"&&new Date(existing.expires_at)>new Date()) return existing;
  if(existing) throw new Error("PROCUREMENT_RESERVATION_EXPIRED_RECOMPARE");
  const qty=Number(loaded.run.cases);
  const reservationId=id("sres");
  const expiresAt=new Date(Date.now()+10*60*1000).toISOString();
  const now=new Date().toISOString();
  const tx=db.transaction(()=>{
    const changed=db.prepare(`UPDATE supplier_listings SET reserved_cases=reserved_cases+?,updated_at=? WHERE id=? AND available_cases-reserved_cases>=?`).run(qty,now,selected.listingId,qty);
    if(changed.changes!==1) throw new Error("SUPPLIER_INVENTORY_RESERVATION_FAILED");
    db.prepare(`INSERT INTO supplier_reservations(id,merchant_id,run_id,listing_id,cases,expires_at,status,created_at) VALUES(?,?,?,?,?,?, 'ACTIVE',?)`).run(reservationId,merchantId,runId,selected.listingId,qty,expiresAt,now);
    return {id:reservationId,status:"ACTIVE",expires_at:expiresAt};
  });
  const reservation=tx();
  audit({eventType:"SUPPLIER_INVENTORY_RESERVED",actor:"SHADOWFUNNEL",severity:"SUCCESS",detail:"Selected connected-supplier inventory was atomically reserved before payment order creation.",metadata:{runId,reservationId,listingId:selected.listingId,cases:qty}});
  return reservation;
}

export function commitSupplierReservation(reservationId:string){
  const now=new Date().toISOString();
  return db.transaction(()=>{
    const r=db.prepare(`SELECT * FROM supplier_reservations WHERE id=?`).get(reservationId) as {id:string;listing_id:string;cases:number;expires_at:string;status:string}|undefined;
    if(!r||r.status!=="ACTIVE"||new Date(r.expires_at)<=new Date()) return false;
    db.prepare(`UPDATE supplier_reservations SET status='COMMITTED' WHERE id=? AND status='ACTIVE'`).run(reservationId);
    db.prepare(`UPDATE supplier_listings SET available_cases=available_cases-?,reserved_cases=reserved_cases-?,updated_at=? WHERE id=?`).run(r.cases,r.cases,now,r.listing_id);
    return true;
  })();
}

export function releaseSupplierReservation(reservationId:string, reason="RELEASED") {
  const now=new Date().toISOString();
  return db.transaction(()=>{
    const r=db.prepare(`SELECT id,listing_id,cases,status FROM supplier_reservations WHERE id=?`).get(reservationId) as {id:string;listing_id:string;cases:number;status:string}|undefined;
    if(!r||r.status!=="ACTIVE") return false;
    const changed=db.prepare(`UPDATE supplier_reservations SET status='RELEASED' WHERE id=? AND status='ACTIVE'`).run(reservationId);
    if(changed.changes!==1) return false;
    db.prepare(`UPDATE supplier_listings SET reserved_cases=MAX(0,reserved_cases-?),updated_at=? WHERE id=?`).run(r.cases,now,r.listing_id);
    audit({eventType:"SUPPLIER_INVENTORY_RELEASED",actor:"SHADOWFUNNEL",severity:"INFO",detail:"Supplier reservation was released safely.",metadata:{reservationId,reason}});
    return true;
  })();
}

export function releaseExpiredSupplierReservations(){
  const expired=db.prepare(`SELECT id,listing_id,cases FROM supplier_reservations WHERE status='ACTIVE' AND expires_at<=?`).all(new Date().toISOString()) as Array<{id:string;listing_id:string;cases:number}>;
  if(!expired.length) return 0;
  db.transaction(()=>{
    for(const r of expired){
      db.prepare(`UPDATE supplier_reservations SET status='EXPIRED' WHERE id=? AND status='ACTIVE'`).run(r.id);
      db.prepare(`UPDATE supplier_listings SET reserved_cases=MAX(0,reserved_cases-?) WHERE id=?`).run(r.cases,r.listing_id);
    }
  })();
  return expired.length;
}

export function procurementOverview(merchantId:string){
  releaseExpiredSupplierReservations();
  const purchases=db.prepare(`SELECT * FROM retailer_purchase_lines WHERE merchant_id=? ORDER BY purchased_at DESC`).all(merchantId) as Array<{product_key:string;product_name:string;supplier_name:string;purchased_at:string;quantity:number;gross_line_paise:number}>;
  const totalSpend=purchases.reduce((s,p)=>s+p.gross_line_paise,0);
  const byProduct=new Map<string,typeof purchases>();
  for(const p of purchases){const list=byProduct.get(p.product_key)??[];list.push(p);byProduct.set(p.product_key,list);}
  const memory=[...byProduct.entries()].map(([key,rows])=>{
    const sorted=[...rows].sort((a,b)=>new Date(a.purchased_at).getTime()-new Date(b.purchased_at).getTime());
    const intervals:number[]=[];
    for(let i=1;i<sorted.length;i++) intervals.push(Math.round((new Date(sorted[i].purchased_at).getTime()-new Date(sorted[i-1].purchased_at).getTime())/86400000));
    const avgDays=intervals.length?Math.max(1,Math.round(intervals.reduce((a,b)=>a+b,0)/intervals.length)):null;
    const latest=sorted.at(-1)!;
    const due=avgDays?new Date(new Date(latest.purchased_at).getTime()+avgDays*86400000):null;
    const daysUntil=due?Math.ceil((due.getTime()-Date.now())/86400000):null;
    const supported=PROCUREMENT.products.some(p=>p.key===key);
    const options=supported?compareConnectedSuppliers({productKey:key,cases:1,budgetPaise:Number.MAX_SAFE_INTEGER,deadlineDays:7,requiresGstInvoice:true},merchantId):[];
    const best=options.find(o=>o.policyResult==="ALLOW")??null;
    const usual=supported?currentUsualCost(key,1):0;
    return {productKey:key,productName:latest.product_name,lastSupplier:latest.supplier_name,lastPurchasedAt:latest.purchased_at,avgReorderDays:avgDays,daysUntilReorder:daysUntil,bestSavingPaise:best?Math.max(0,usual-best.grossPayablePaise):0,bestSupplier:best?.supplierName??null};
  }).sort((a,b)=>(a.daysUntilReorder??999)-(b.daysUntilReorder??999));
  const savings=memory.reduce((s,m)=>s+m.bestSavingPaise,0);
  const recentRuns=db.prepare(`SELECT id,raw_text,status,savings_paise,created_at FROM procurement_runs WHERE merchant_id=? ORDER BY created_at DESC LIMIT 5`).all(merchantId);
  const recentOrders=db.prepare(`SELECT po.id,po.status,po.expected_amount_paise,po.razorpay_order_id,po.updated_at,cs.name supplier_name,pr.product_key FROM procurement_orders po JOIN procurement_runs pr ON pr.id=po.run_id LEFT JOIN supplier_listings sl ON sl.id=pr.selected_listing_id LEFT JOIN connected_suppliers cs ON cs.id=sl.supplier_id WHERE po.merchant_id=? ORDER BY po.updated_at DESC LIMIT 5`).all(merchantId);
  return {totalSpendPaise:totalSpend,purchaseCount:purchases.length,recurringProducts:memory.length,potentialSavingsPaise:savings,memory,purchases:purchases.slice(0,20),recentRuns,recentOrders,connectedSuppliers:Number((db.prepare(`SELECT COUNT(*) n FROM connected_suppliers WHERE connected=1`).get() as {n:number}).n)};
}

export function saveExtractedInvoice(merchantId:string,input:{supplierName:string;invoiceDate?:string;items:Array<{productName:string;brand?:string;pack?:string;quantity:number;grossLineAmount:string|number;gstRatePercent?:string|number}>},sourceName:string,sourceHash?:string){
  const date=input.invoiceDate&&/^\d{4}-\d{2}-\d{2}/.test(input.invoiceDate)?input.invoiceDate.slice(0,10):new Date().toISOString().slice(0,10);
  const stmt=db.prepare(`INSERT OR IGNORE INTO retailer_purchase_lines(id,merchant_id,source,supplier_name,purchased_at,product_key,product_name,brand,pack,quantity,gross_line_paise,gst_rate,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  let inserted=0;
  let accepted=0;
  db.transaction(()=>{
    for(const [index,item] of input.items.entries()){
      const rawAmount=String(item.grossLineAmount).trim();
      const rawGst=String(item.gstRatePercent??0).trim();
      if(!Number.isSafeInteger(item.quantity)||item.quantity<=0||item.quantity>100000) continue;
      if(!/^\d+(?:\.\d{1,2})?$/.test(rawAmount)||!/^\d+(?:\.\d{1,4})?$/.test(rawGst)) continue;
      const identityText=`${item.productName} ${item.brand??""} ${item.pack??""}`;
      const productKey=normalizeProcurementProduct(identityText)??unmatchedProductKey(identityText);
      const paiseDecimal=new Decimal(rawAmount).mul(100).toDecimalPlaces(0,Decimal.ROUND_HALF_UP);
      const paise=paiseDecimal.toNumber();
      if(!Number.isSafeInteger(paise)||paise<=0) continue;
      const gstPercent=new Decimal(rawGst);
      if(gstPercent.isNegative()||gstPercent.greaterThan(100)) continue;
      const gstRate=gstPercent.div(100).toDecimalPlaces(6,Decimal.ROUND_HALF_UP).toString();
      accepted++;
      const lineId=sourceHash?`invoice_${sourceHash}_${index}`:id("pline");
      inserted+=stmt.run(lineId,merchantId,sourceName,input.supplierName,date,productKey,item.productName,item.brand??"",item.pack??"",item.quantity,paise,gstRate,new Date().toISOString()).changes;
    }
  })();
  const duplicate=accepted>0&&inserted===0;
  audit({eventType:duplicate?"INVOICE_ALREADY_IMPORTED":"PURCHASE_MEMORY_UPDATED",actor:"INVOICE_INTELLIGENCE",severity:inserted?"SUCCESS":duplicate?"INFO":"WARN",detail:inserted?`Added ${inserted} extracted purchase line(s) to retailer purchase memory.`:duplicate?"The exact invoice was already present; no duplicate purchase lines were created.":"Invoice extraction returned no valid monetary lines to persist.",metadata:{sourceName,supplierName:input.supplierName,inserted,accepted,duplicate,sourceHash:sourceHash??null}});
  return {inserted,accepted,duplicate};
}
