import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { enforceSameOrigin } from "@/lib/security";
import { persistReplayRun } from "@/lib/replay";
import { audit } from "@/lib/audit";

const schema = z.object({
  mode: z.enum(["ISOLATED", "STATEFUL"]).default("ISOLATED"),
  count: z.number().int().min(50).max(5000).default(1000),
  seed: z.number().int().min(1).max(2_147_483_647).default(20260904)
});

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    await requireApiSession();
    const body = await request.json().catch(() => ({}));
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "INVALID_REPLAY_CONFIG", details: parsed.error.flatten() }, { status: 400 });
    const result = persistReplayRun(parsed.data);
    audit({ eventType: "REPLAY_RUN_COMPLETED", actor: "REPLAY_ENGINE", severity: result.summary.regressions === 0 || parsed.data.mode === "STATEFUL" ? "SUCCESS" : "BLOCK", detail: `${parsed.data.mode} replay completed on ${result.summary.intents} deterministic intents.`, metadata: { runId: result.runId, mode: parsed.data.mode, seed: parsed.data.seed, regressions: result.summary.regressions, incrementalContributionPaise: result.summary.incrementalContributionPaise } });
    if (parsed.data.mode === "ISOLATED" && result.summary.regressions !== 0) return NextResponse.json({ error: "ISOLATED_REPLAY_REGRESSION_INVARIANT_FAILED", result }, { status: 409 });
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "REPLAY_FAILED";
    return NextResponse.json({ error: message }, { status: message === "UNAUTHORIZED" ? 401 : 400 });
  }
}
