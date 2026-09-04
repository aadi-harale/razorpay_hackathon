import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";
import { enforceSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Request rejected." }, { status: 400 });
  }
}
