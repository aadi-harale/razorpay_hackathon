import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { runFlagshipDemo } from "@/lib/demo";
import { enforceSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    await requireApiSession();
    const result = runFlagshipDemo();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Demo failed closed." }, { status: 400 });
  }
}
