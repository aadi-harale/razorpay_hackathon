import { NextResponse } from "next/server";
import { z } from "zod";
import { assertLoginAllowed, clearLoginFailures, createSession, loginAttemptKey, recordLoginFailure, verifyCredentials } from "@/lib/auth";
import { enforceSameOrigin } from "@/lib/security";

const schema = z.object({ email: z.string().email().max(200), password: z.string().min(8).max(200) });

export async function POST(request: Request) {
  try {
    enforceSameOrigin(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid login payload." }, { status: 400 });
    const key = loginAttemptKey(request, parsed.data.email);
    assertLoginAllowed(key);
    if (!verifyCredentials(parsed.data.email, parsed.data.password)) {
      recordLoginFailure(key);
      await new Promise((resolve) => setTimeout(resolve, 250));
      return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
    }
    clearLoginFailures(key);
    await createSession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login request rejected.";
    if (message === "LOGIN_TEMPORARILY_BLOCKED") {
      return NextResponse.json({ error: "Too many failed attempts. Run reset-login.bat or wait 10 minutes." }, { status: 429 });
    }
    if (message === "CROSS_ORIGIN_MUTATION_BLOCKED") {
      return NextResponse.json({ error: "Login origin rejected. Open the exact URL printed by start.bat." }, { status: 403 });
    }
    console.error("[RazorProcure] Login error", error);
    return NextResponse.json({ error: "Login service error. Run reset-login.bat, then try again." }, { status: 500 });
  }
}
