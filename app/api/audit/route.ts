import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { listAudit } from "@/lib/audit";

export async function GET() {
  try {
    await requireApiSession();
    return NextResponse.json({ events: listAudit(200) });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
