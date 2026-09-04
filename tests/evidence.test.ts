import { describe, expect, it } from "vitest";
import { loadDemoFscCertificate, verifyFscCertificate } from "@/lib/engines/evidence";

describe("predicate-specific evidence verifier",()=>{
  it("accepts an in-scope certificate inside its validity window",()=>{
    const f=verifyFscCertificate({source:"cert.pdf",validFrom:"2026-04-01",validUntil:"2027-03-31",scope:"BX-series packaging",requiredScope:"BX-series",now:new Date("2026-09-04T12:00:00Z")});
    expect(f.status).toBe("VERIFIED_CURRENT");
  });
  it("extracts the bundled PDF fields before verifying the demo certificate",()=>{
    const f=loadDemoFscCertificate(new Date("2026-09-04T12:00:00Z"));
    expect(f.status).toBe("VERIFIED_CURRENT");
    expect(f.validFrom).toBe("2026-04-01");
    expect(f.validUntil).toBe("2027-03-31");
    expect(f.scope).toBe("BX-series packaging");
  });
  it("rejects expired or wrong-scope evidence",()=>{
    const expired=verifyFscCertificate({source:"cert.pdf",validFrom:"2025-01-01",validUntil:"2025-12-31",scope:"BX-series packaging",requiredScope:"BX-series",now:new Date("2026-09-04T12:00:00Z")});
    const wrong=verifyFscCertificate({source:"cert.pdf",validFrom:"2026-01-01",validUntil:"2027-01-01",scope:"Other products",requiredScope:"BX-series",now:new Date("2026-09-04T12:00:00Z")});
    expect(expired.status).toBe("UNVERIFIED");
    expect(wrong.status).toBe("UNVERIFIED");
  });
});
