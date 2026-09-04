import type { ProcurementOption } from "@/lib/procurement";

export type ResilienceOutcome="STABLE"|"SWITCH"|"APPROVAL_REQUIRED"|"BLOCKED";
export type ResilienceScenario={
  id:"PRICE_SHOCK"|"SUPPLIER_OUTAGE"|"DELIVERY_SLIP"|"DEMAND_SURGE";
  title:string;
  trigger:string;
  outcome:ResilienceOutcome;
  supplierName:string|null;
  payablePaise:number|null;
  deltaPaise:number|null;
  protectedValuePaise:number;
  reason:string;
};

type Input={options:ProcurementOption[];selectedListingId:string;cases:number;budgetPaise:number;deadlineDays:number;spendLimitPaise:number};
type ScenarioConfig={id:ResilienceScenario["id"];title:string;trigger:string;excludedListingId?:string;selectedPriceBps?:number;selectedDelayDays?:number;caseMultiplier?:number;budgetMultiplier?:number};

export function analyzeProcurementResilience(input:Input){
  const selected=input.options.find(option=>option.listingId===input.selectedListingId);
  if(!selected||input.cases<=0||input.options.length===0)throw new Error("RESILIENCE_PLAN_INVALID");
  const configs:ScenarioConfig[]=[
    {id:"PRICE_SHOCK",title:"Price shock",trigger:"Chosen supplier raises its quote by 7%",selectedPriceBps:10_700},
    {id:"SUPPLIER_OUTAGE",title:"Supplier outage",trigger:"Chosen supplier becomes unavailable",excludedListingId:selected.listingId},
    {id:"DELIVERY_SLIP",title:"Delivery slip",trigger:"Chosen supplier slips by 2 days",selectedDelayDays:2},
    {id:"DEMAND_SURGE",title:"Demand surge",trigger:"Required cases double unexpectedly",caseMultiplier:2,budgetMultiplier:2}
  ];

  const scenarios=configs.map(config=>{
    const targetCases=input.cases*(config.caseMultiplier??1);
    const targetBudget=input.budgetPaise*(config.budgetMultiplier??1);
    const candidates=input.options.filter(option=>option.listingId!==config.excludedListingId).map(option=>{
      let payable=config.caseMultiplier?option.casePricePaise*targetCases+option.shippingPaise:option.grossPayablePaise;
      if(option.listingId===selected.listingId&&config.selectedPriceBps)payable=Math.ceil(payable*config.selectedPriceBps/10_000);
      const eta=option.etaDays+(option.listingId===selected.listingId?(config.selectedDelayDays??0):0);
      const hardPass=option.checks.supplier==="PASS"&&option.checks.gstInvoice==="PASS"&&option.availableCases>=targetCases&&eta<=input.deadlineDays&&payable<=targetBudget;
      return {...option,scenarioPayablePaise:payable,scenarioEtaDays:eta,hardPass,needsApproval:payable>input.spendLimitPaise};
    }).filter(candidate=>candidate.hardPass).sort((a,b)=>Number(a.needsApproval)-Number(b.needsApproval)||a.scenarioPayablePaise-b.scenarioPayablePaise||b.reliability-a.reliability);
    const winner=candidates[0];
    if(!winner)return {id:config.id,title:config.title,trigger:config.trigger,outcome:"BLOCKED" as const,supplierName:null,payablePaise:null,deltaPaise:null,protectedValuePaise:0,reason:"No connected supplier can satisfy every hard constraint under this scenario."};
    const outcome:ResilienceOutcome=winner.needsApproval?"APPROVAL_REQUIRED":winner.listingId===selected.listingId?"STABLE":"SWITCH";
    const shockedSelected=config.id==="PRICE_SHOCK"?Math.ceil(selected.grossPayablePaise*10_700/10_000):null;
    const protectedValuePaise=shockedSelected===null?0:Math.max(0,shockedSelected-winner.scenarioPayablePaise);
    const reason=outcome==="STABLE"?"The original plan remains inside budget, delivery, stock and policy limits.":outcome==="SWITCH"?`Switch to ${winner.supplierName} without pausing for manual approval.`:outcome==="APPROVAL_REQUIRED"?`${winner.supplierName} remains feasible, but the revised spend exceeds autonomous authority.`:"No safe fallback.";
    return {id:config.id,title:config.title,trigger:config.trigger,outcome,supplierName:winner.supplierName,payablePaise:winner.scenarioPayablePaise,deltaPaise:winner.scenarioPayablePaise-selected.grossPayablePaise,protectedValuePaise,reason};
  });

  const penalty:Record<ResilienceOutcome,number>={STABLE:0,SWITCH:6,APPROVAL_REQUIRED:15,BLOCKED:30};
  const resilienceScore=Math.max(0,100-scenarios.reduce((sum,scenario)=>sum+penalty[scenario.outcome],0));
  const safe=scenarios.filter(scenario=>scenario.outcome==="STABLE"||scenario.outcome==="SWITCH").length;
  const approvals=scenarios.filter(scenario=>scenario.outcome==="APPROVAL_REQUIRED").length;
  const blocked=scenarios.filter(scenario=>scenario.outcome==="BLOCKED").length;
  const fallbackCounts=new Map<string,{count:number;scenario:ResilienceScenario}>();
  for(const scenario of scenarios.filter(scenario=>scenario.outcome==="SWITCH"&&scenario.supplierName)){
    const current=fallbackCounts.get(scenario.supplierName!);fallbackCounts.set(scenario.supplierName!,{count:(current?.count??0)+1,scenario});
  }
  const fallback=[...fallbackCounts.values()].sort((a,b)=>b.count-a.count)[0]?.scenario??null;
  return {
    resilienceScore,
    grade:resilienceScore>=85?"RESILIENT":resilienceScore>=65?"GUARDED":"FRAGILE",
    baseline:{supplierName:selected.supplierName,payablePaise:selected.grossPayablePaise,reliability:selected.reliability},
    autonomyEnvelope:{safe,approvals,blocked,total:scenarios.length},
    preClearedFallback:fallback?{supplierName:fallback.supplierName!,payablePaise:fallback.payablePaise!,deltaPaise:fallback.deltaPaise!}:null,
    downsideAvoidedPaise:scenarios.reduce((sum,scenario)=>sum+scenario.protectedValuePaise,0),
    scenarios
  };
}
