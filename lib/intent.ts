import Decimal from "decimal.js";
import { z } from "zod";

export const buyerIntentSchema = z.object({
  quantity: z.number().int().min(1).max(200),
  budgetMaxPaise: z.number().int().positive().max(100_000_000),
  destination: z.string().trim().min(2).max(80),
  deliveryText: z.string().trim().max(120).optional(),
  hardRequirements: z.array(z.enum(["GST_INVOICE", "FSC_CERTIFIED"])).max(2).default([]),
  softRequirements: z.array(z.string().trim().min(1).max(60)).max(12).default([])
});
export type BuyerIntentInput = z.infer<typeof buyerIntentSchema>;

function rupeesToPaise(raw: string): number {
  return new Decimal(raw.replace(/,/g, "")).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function parseBuyerIntentDeterministically(rawText: string): BuyerIntentInput {
  const raw = rawText.trim();
  if (!raw || raw.length > 1200) throw new Error("BUYER_INTENT_TEXT_INVALID");
  const quantityMatch = raw.match(/(?:buy|need|want|order)?\s*(\d{1,3})\s+(?:units?|boxes?|gift\s*boxes?)/i) ?? raw.match(/\b(\d{1,3})\b/);
  const budgetMatch = raw.match(/(?:under|below|max(?:imum)?|≤|upto|up to)\s*₹\s*([0-9,]+(?:\.\d{1,2})?)/i) ?? raw.match(/₹\s*([0-9,]+(?:\.\d{1,2})?)/i);
  const destinationMatch = raw.match(/(?:deliver(?:ed)?\s+to|to)\s+([A-Za-z][A-Za-z .-]{1,40}?)(?:\s+(?:by|before|under|below|with|and)|[,.;]|$)/i);
  if (!quantityMatch || !budgetMatch || !destinationMatch) throw new Error("BUYER_INTENT_COULD_NOT_BE_PARSED_DETERMINISTICALLY");
  const hardRequirements: BuyerIntentInput["hardRequirements"] = [];
  if (/GST\s*(?:invoice|bill)|tax\s+invoice/i.test(raw)) hardRequirements.push("GST_INVOICE");
  if (/FSC|sustainable\s+(?:packaging|box)|certified\s+sustainable/i.test(raw)) hardRequirements.push("FSC_CERTIFIED");
  const delivery = raw.match(/(?:by|before)\s+([^,.;]{2,40})/i)?.[1]?.trim();
  return buyerIntentSchema.parse({
    quantity: Number(quantityMatch[1]),
    budgetMaxPaise: rupeesToPaise(budgetMatch[1]),
    destination: destinationMatch[1].trim(),
    deliveryText: delivery,
    hardRequirements,
    softRequirements: []
  });
}
