import { createHash } from "node:crypto";

export type OfferHashInput = {
  merchantId:string;
  intentId:string;
  sku:string;
  qty:number;
  locationId:string;
  grossAmountPaise:number;
  currency:string;
  contributionMargin:string;
};

export function hashOffer(input: OfferHashInput) {
  return createHash("sha256").update(JSON.stringify({
    merchantId:input.merchantId,
    intentId:input.intentId,
    sku:input.sku,
    qty:input.qty,
    locationId:input.locationId,
    grossAmountPaise:input.grossAmountPaise,
    currency:input.currency,
    contributionMargin:input.contributionMargin
  })).digest("hex");
}
