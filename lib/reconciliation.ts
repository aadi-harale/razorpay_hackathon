import Decimal from "decimal.js";

export type ThreeWayMatchInput={orderedCases:number;receivedCases:number;authorizedAmountPaise:number;invoicedAmountPaise:number};

export function reconcileThreeWay(input:ThreeWayMatchInput){
  for(const [name,value] of Object.entries(input)){
    if(!Number.isSafeInteger(value)||value<0)throw new Error(`RECONCILIATION_${name.toUpperCase()}_INVALID`);
  }
  if(input.orderedCases<=0||input.authorizedAmountPaise<=0||input.invoicedAmountPaise<=0)throw new Error("RECONCILIATION_VALUE_INVALID");
  const quantityVarianceCases=input.receivedCases-input.orderedCases;
  const invoiceVariancePaise=input.invoicedAmountPaise-input.authorizedAmountPaise;
  const fairReceivedValue=new Decimal(input.authorizedAmountPaise).mul(input.receivedCases).div(input.orderedCases).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toNumber();
  const protectedValuePaise=Math.max(0,input.invoicedAmountPaise-fairReceivedValue);
  const quantityMatch=quantityVarianceCases===0;
  const invoiceMatch=invoiceVariancePaise===0;
  const status=quantityMatch&&invoiceMatch?"MATCHED":"EXCEPTION_BLOCKED" as const;
  const exceptions:string[]=[];
  if(quantityVarianceCases<0)exceptions.push(`${Math.abs(quantityVarianceCases)} case(s) short received`);
  if(quantityVarianceCases>0)exceptions.push(`${quantityVarianceCases} unexpected extra case(s)`);
  if(invoiceVariancePaise>0)exceptions.push(`invoice exceeds authorization by ${invoiceVariancePaise} paise`);
  if(invoiceVariancePaise<0)exceptions.push(`invoice is ${Math.abs(invoiceVariancePaise)} paise below authorization`);
  return {status,checks:{purchaseOrder:"PASS" as const,receipt:quantityMatch?"PASS" as const:"FAIL" as const,invoice:invoiceMatch?"PASS" as const:"FAIL" as const},quantityVarianceCases,invoiceVariancePaise,fairReceivedValuePaise:fairReceivedValue,protectedValuePaise,exceptions};
}
