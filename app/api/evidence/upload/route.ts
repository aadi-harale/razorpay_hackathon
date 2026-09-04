import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { enforceSameOrigin, publicApiError } from "@/lib/security";
import { ingestEvidenceFile } from "@/lib/evidenceUpload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    const session = await requireApiSession();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "EVIDENCE_FILE_REQUIRED" }, { status: 400 });
    const result = await ingestEvidenceFile(file, session.merchantId);
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const raw = error instanceof Error ? error.message : "";
    const status = raw === "UNAUTHORIZED" ? 401 : raw.includes("TYPE") || raw.includes("SIZE") ? 415 : 400;
    return NextResponse.json({ error: publicApiError(error, "Evidence upload was rejected safely.") }, { status });
  }
}
