import { NextResponse } from "next/server";
import { buyerIntentSchema } from "@/lib/intent";
import { requireAgentToken } from "@/lib/agentAuth";
import { agentOfferPreview } from "@/lib/agentCommerce";
import { audit } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    requireAgentToken(request);
    const parsed = buyerIntentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_AGENT_INTENT", details: parsed.error.flatten() }, { status: 400 });
    const result = agentOfferPreview(parsed.data);
    audit({ eventType: "AGENT_OFFER_PREVIEW", actor: "EXTERNAL_AGENT", severity: result.offer ? "SUCCESS" : "WARN", detail: result.offer ? "A non-binding machine-readable offer preview was produced without reserving inventory or creating payment authority." : "No safe non-binding offer preview is available.", metadata: { evaluationId: result.evaluationId, previewId: result.offer?.previewId ?? null, decision: result.decision, provenance: result.provenance } });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent request rejected.";
    return NextResponse.json({ error: message }, { status: message === "AGENT_UNAUTHORIZED" ? 401 : 503 });
  }
}
