import { NextResponse } from "next/server";
import { DEMO } from "@/lib/config";
import { requireAgentToken } from "@/lib/agentAuth";
import { currentGstCapability, loadDemoFscCertificate } from "@/lib/engines/evidence";
import { inventorySnapshot } from "@/lib/inventory";
import { audit } from "@/lib/audit";

export async function GET(request: Request) {
  try {
    requireAgentToken(request);
    const gst = currentGstCapability();
    const fsc = loadDemoFscCertificate();
    const inventory = inventorySnapshot();
    audit({ eventType: "AGENT_CATALOG_QUERY", actor: "EXTERNAL_AGENT", detail: "Authenticated external buyer queried the machine-readable catalog surface.", metadata: { provenance: "OBSERVED" } });
    return NextResponse.json({
      schemaVersion: "2026-09-04",
      merchant: { id: DEMO.merchantId, name: DEMO.merchantName, currency: DEMO.currency },
      products: [{
        sku: DEMO.sku,
        name: DEMO.productName,
        grossUnitPricePaise: DEMO.unitGrossPaise,
        tax: { pricesAreGstInclusive: true, outputGstRate: DEMO.outputGstRate },
        evidence: {
          gstInvoiceAvailable: { status: gst.status, sourceClass: gst.evidenceClass },
          fscCertified: { status: fsc.status, sourceClass: fsc.evidenceClass, validUntil: fsc.validUntil ?? null, scope: fsc.scope ?? null }
        },
        inventory
      }],
      claimBoundary: "Only queries that reach this surface are observable by ShadowFunnel."
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent request rejected.";
    return NextResponse.json({ error: message }, { status: message === "AGENT_UNAUTHORIZED" ? 401 : 503 });
  }
}
