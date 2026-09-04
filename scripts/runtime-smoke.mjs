import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseEnv(path){
  try{return Object.fromEntries(readFileSync(path,"utf8").split(/\r?\n/).map(line=>line.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(match=>[match[1],match[2].trim().replace(/^['"]|['"]$/g,"")]))}catch{return {}};
}
const env={...parseEnv(resolve(process.cwd(),".env.local")),...process.env};
let port="3100";try{port=readFileSync(resolve(process.cwd(),".run","server.port"),"utf8").trim()||port}catch{}
const base=env.RAZORPROCURE_URL||`http://localhost:${port}`;
let cookie="";

async function call(path,options={}){
  const headers=new Headers(options.headers);if(cookie)headers.set("cookie",cookie);
  const response=await fetch(`${base}${path}`,{...options,headers,redirect:"manual"});
  const setCookie=response.headers.get("set-cookie");if(setCookie)cookie=setCookie.split(";",1)[0];
  const text=await response.text();let body;try{body=JSON.parse(text)}catch{body=text}
  if(!response.ok)throw new Error(`${path} returned ${response.status}: ${typeof body==="string"?body.slice(0,160):body.error||"unexpected response"}`);
  return {response,body};
}
function expect(condition,message){if(!condition)throw new Error(message)}

const health=(await call("/api/health")).body;
expect(health.app==="razorprocure"&&health.status==="ok","Health contract failed");
await call("/api/auth/login",{method:"POST",headers:{"content-type":"application/json","origin":base},body:JSON.stringify({email:env.DEMO_EMAIL,password:env.DEMO_PASSWORD})});

const invoice=new FormData();invoice.set("file",new File([readFileSync(resolve(process.cwd(),"public","demo","sample-invoice.png"))],"sample-invoice.png",{type:"image/png"}));
const imported=(await call("/api/procurement/invoice",{method:"POST",headers:{origin:base},body:invoice})).body;
expect(imported.inserted>=0&&typeof imported.duplicate==="boolean","Invoice import contract failed");

const basket=(await call("/api/procurement/basket",{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify({lines:[{productKey:"fortune-sunflower-oil-1l-case48",cases:20},{productKey:"maggi-masala-70g-case96",cases:1},{productKey:"surf-excel-matic-1kg-case24",cases:1}]})})).body;
expect(basket.lines.length===3&&basket.supplierAllocation.length>=2&&basket.savingsPaise>0,"Basket optimization contract failed");

const demo=(await call("/api/demo/run",{method:"POST",headers:{origin:base}})).body;
expect(demo.offerId&&demo.steps.length>=8,"Flagship workflow failed");
if(health.paymentMode==="demo"){
  const checkout=(await call("/api/checkout/start",{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify({offerId:demo.offerId})})).body;
  expect(checkout.mode==="demo"&&checkout.status==="PAID"&&String(checkout.paymentId).startsWith("demo_pay_"),"Dummy payment contract failed");

  const requestText="Buy 1 case of Fortune Sunflower Oil 1L x 48 under ₹8,500 within 2 days with GST invoice";
  const comparison=(await call("/api/procurement/compare",{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify({text:requestText})})).body;
  expect(comparison.recommended?.policyResult==="ALLOW","Smart Buy recommendation failed");
  const procurementCheckout=(await call("/api/procurement/checkout/start",{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify({runId:comparison.runId,text:requestText})})).body;
  expect(procurementCheckout.status==="PAID"&&procurementCheckout.receiptToken,"Procurement checkout did not issue receiving authority");
  const exactReceipt=(await call("/api/procurement/receive",{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify({receiptToken:procurementCheckout.receiptToken,invoiceNumber:`SMOKE-OK-${Date.now()}`,receivedCases:1,invoicedAmountPaise:procurementCheckout.amount})})).body;
  expect(exactReceipt.status==="MATCHED"&&exactReceipt.protectedValuePaise===0,"Three-way match contract failed");
  const guardedReceipt=(await call("/api/procurement/receive",{method:"POST",headers:{"content-type":"application/json",origin:base},body:JSON.stringify({receiptToken:procurementCheckout.receiptToken,invoiceNumber:`SMOKE-VAR-${Date.now()}`,receivedCases:1,invoicedAmountPaise:procurementCheckout.amount+25_000})})).body;
  expect(guardedReceipt.status==="EXCEPTION_BLOCKED"&&guardedReceipt.protectedValuePaise===25_000,"Delivery discrepancy shield failed");
}

const race=(await call("/api/demo/race",{method:"POST",headers:{origin:base}})).body;
expect([race.first,race.second].filter(state=>state==="RESERVED").length===1,"Atomic race failed");
expect(race.replan?.decision==="APPROVAL_REQUIRED","Graceful replan failed");
const replay=(await call("/api/replay/run",{method:"POST",headers:{origin:base}})).body;
expect(replay.summary&&Number.isInteger(replay.summary.controlPaid),"Replay failed");
const audit=(await call("/api/audit")).body;
expect(Array.isArray(audit.events)&&audit.events.length>0,"Audit trail failed");

console.log(`Runtime smoke PASS (${base}, paymentMode=${health.paymentMode}, auditEvents=${audit.events.length})`);
