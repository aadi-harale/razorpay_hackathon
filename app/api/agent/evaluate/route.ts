import { NextResponse } from "next/server";
import { buyerIntentSchema } from "@/lib/intent";
import { requireAgentToken } from "@/lib/agentAuth";
import { evaluateAgentIntent } from "@/lib/agentCommerce";
import { audit } from "@/lib/audit";

export async function POST(request: Request) {
  try {
    requireAgentToken(request);
    const parsed = buyerIntentSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "INVALID_AGENT_INTENT", details: parsed.error.flatten() }, { status: 400 });
    const result = evaluateAgentIntent(parsed.data);
    audit({ eventType: result.recommended ? "AGENT_OFFER_EVALUATED" : "AGENT_EVALUATION_BLOCKED", actor: "EXTERNAL_AGENT", severity: result.recommended ? "SUCCESS" : "WARN", detail: result.recommended ? "External buyer has at least one buyer-compatible, merchant-safe candidate." : "No current candidate satisfies every buyer and merchant constraint.", metadata: { evaluationId: result.evaluationId, decision: result.decision, recommendedRoute: result.recommended?.route ?? null, hardFailures: result.hardFailures, provenance: result.provenance } });
    return NextResponse.json({ ...result, note: "Evaluation never reserves stock or authorizes payment." }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent request rejected.";
    return NextResponse.json({ error: message }, { status: message === "AGENT_UNAUTHORIZED" ? 401 : 503 });
  }
}
