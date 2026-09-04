import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { runReservationRace } from "@/lib/demo";
import { enforceSameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    await requireApiSession();
    return NextResponse.json(runReservationRace());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Race demo failed." }, { status: 400 });
  }
}
