import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { resetDemoState } from "@/lib/demo";
import { enforceSameOrigin } from "@/lib/security";
import { durableCheckpoint } from "@/lib/db";

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    await requireApiSession();
    resetDemoState();
    await durableCheckpoint();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Request rejected." }, { status: 401 });
  }
}
