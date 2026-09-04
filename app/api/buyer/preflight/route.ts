import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { parseBuyerIntentDeterministically } from "@/lib/intent";
import { evaluateAgentIntent } from "@/lib/agentCommerce";
import { audit } from "@/lib/audit";
import { enforceSameOrigin } from "@/lib/security";

const schema = z.object({ text: z.string().trim().min(12).max(1200) });

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    await requireApiSession();
    const body = schema.safeParse(await request.json());
    if (!body.success) return NextResponse.json({ error: "INVALID_BUYER_REQUEST" }, { status: 400 });
    const intent = parseBuyerIntentDeterministically(body.data.text);
    const evaluation = evaluateAgentIntent(intent);
    audit({
      eventType: evaluation.recommended ? "MERCHANT_PREFLIGHT_OFFERABLE" : "MERCHANT_PREFLIGHT_BLOCKED",
      actor: "MERCHANT_CONSOLE",
      severity: evaluation.recommended ? "SUCCESS" : "WARN",
      detail: evaluation.recommended ? "Merchant preflight found a buyer-compatible, merchant-safe route." : "Merchant preflight found no currently safe offer.",
      metadata: { evaluationId: evaluation.evaluationId, decision: evaluation.decision, destination: intent.destination, quantity: intent.quantity, recommendedRoute: evaluation.recommended?.route ?? null }
    });
    return NextResponse.json({ intent, evaluation, note: "Preflight is non-binding. Checkout still requires a server-bound offer, policy decision and atomic reservation." }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PREFLIGHT_FAILED";
    return NextResponse.json({ error: message }, { status: message.includes("PARSED") ? 422 : 400 });
  }
}
