import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { latestPersistedReplay, opportunityCards, pairedReplaySummary, multiFixCombinations, pairedReplayDetailed } from "@/lib/replay";

export async function GET() {
  try {
    await requireApiSession();
    const persisted = latestPersistedReplay();
    if (persisted) return NextResponse.json({ persisted: true, ...persisted }, { headers: { "cache-control": "no-store" } });
    const detailed = pairedReplayDetailed();
    return NextResponse.json({ persisted: false, summary: pairedReplaySummary(), opportunities: opportunityCards(detailed), multiFixCombinations: multiFixCombinations(detailed) }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
