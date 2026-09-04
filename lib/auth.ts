import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { APP_ORIGIN, DEMO, DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/config";
import { randomToken, safeSecretEqual, sha256, signServerState, verifyServerState } from "@/lib/security";

const COOKIE_NAME = "sf_session";
const SESSION_HOURS = 12;

export function verifyCredentials(email: string, password: string) {
  return safeSecretEqual(email.toLowerCase(), DEMO_EMAIL.toLowerCase()) && safeSecretEqual(password, DEMO_PASSWORD);
}

export async function createSession() {
  const now = Date.now();
  const expiresAt = now + SESSION_HOURS * 60 * 60 * 1000;
  const token = signServerState({ merchantId: DEMO.merchantId, exp: expiresAt, nonce: randomToken(12) });
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && new URL(APP_ORIGIN).protocol === "https:",
    sameSite: "strict",
    path: "/",
    expires: new Date(expiresAt)
  });
}

export async function destroySession() {
  const store = await cookies();
  store.set(COOKIE_NAME, "", { httpOnly: true, path: "/", maxAge: 0, sameSite: "strict" });
}

export async function getSession() {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = verifyServerState<{ merchantId:string; exp:number; nonce:string }>(token);
  if (!payload || payload.merchantId !== DEMO.merchantId || !Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
  return { merchantId: payload.merchantId };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireApiSession() {
  const session = await getSession();
  if (!session) throw new Error("UNAUTHORIZED");
  return session;
}

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_BLOCK_MS = 10 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;

export function loginAttemptKey(request: Request, email: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "local";
  return sha256(`${email.trim().toLowerCase()}|${address}`);
}

export function assertLoginAllowed(key: string) {
  const row = db.prepare("SELECT failures, first_failure_at, blocked_until FROM login_attempts WHERE key=?").get(key) as { failures:number; first_failure_at:string; blocked_until:string|null } | undefined;
  if (!row) return;
  const now = Date.now();
  if (row.blocked_until && new Date(row.blocked_until).getTime() > now) throw new Error("LOGIN_TEMPORARILY_BLOCKED");
  if (now - new Date(row.first_failure_at).getTime() > LOGIN_WINDOW_MS) db.prepare("DELETE FROM login_attempts WHERE key=?").run(key);
}

export function recordLoginFailure(key: string) {
  const now = new Date();
  const tx = db.transaction(() => {
    const row = db.prepare("SELECT failures, first_failure_at FROM login_attempts WHERE key=?").get(key) as { failures:number; first_failure_at:string } | undefined;
    if (!row || now.getTime() - new Date(row.first_failure_at).getTime() > LOGIN_WINDOW_MS) {
      db.prepare("INSERT OR REPLACE INTO login_attempts (key, failures, first_failure_at, blocked_until) VALUES (?, 1, ?, NULL)").run(key, now.toISOString());
      return;
    }
    const failures = row.failures + 1;
    const blockedUntil = failures >= LOGIN_MAX_FAILURES ? new Date(now.getTime() + LOGIN_BLOCK_MS).toISOString() : null;
    db.prepare("UPDATE login_attempts SET failures=?, blocked_until=? WHERE key=?").run(failures, blockedUntil, key);
  });
  tx();
}

export function clearLoginFailures(key: string) {
  db.prepare("DELETE FROM login_attempts WHERE key=?").run(key);
}
