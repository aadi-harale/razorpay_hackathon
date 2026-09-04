import { describe, expect, it } from "vitest";
import { hashOffer } from "@/lib/offers";

const base = { merchantId:"m", intentId:"i", sku:"BX-104", qty:20, locationId:"WH-PNQ-EDGE", grossAmountPaise:798000, currency:"INR", contributionMargin:"0.27553" };

describe("offer integrity binding", () => {
  it("is stable for identical canonical inputs", () => expect(hashOffer(base)).toBe(hashOffer({ ...base })));
  it("changes if one rupee changes", () => expect(hashOffer(base)).not.toBe(hashOffer({ ...base, grossAmountPaise: 798100 })));
  it("changes if fulfilment location changes", () => expect(hashOffer(base)).not.toBe(hashOffer({ ...base, locationId:"WH-MUM-CENTRAL" })));
});
