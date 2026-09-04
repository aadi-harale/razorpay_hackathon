import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { APP_ORIGIN, SESSION_SECRET } from "@/lib/config";

export function sha256(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmac(input: string): Buffer {
  return createHmac("sha256", SESSION_SECRET).update(input).digest();
}

export function safeSecretEqual(a: string, b: string): boolean {
  const ah = hmac(a);
  const bh = hmac(b);
  return ah.length === bh.length && timingSafeEqual(ah, bh);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function enforceSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;

  let originUrl: URL;
  try { originUrl = new URL(origin); } catch { throw new Error("CROSS_ORIGIN_MUTATION_BLOCKED"); }

  // Prefer the external Host/Forwarded headers because server runtimes and reverse
  // proxies may construct request.url with an internal host/port.
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const requestUrl = new URL(request.url);
  const proto = forwardedProto || requestUrl.protocol.replace(":", "");

  if (host && originUrl.host === host && originUrl.protocol === `${proto}:`) return;

  const requestOrigin = requestUrl.origin;
  const configuredOrigin = (() => { try { return new URL(APP_ORIGIN).origin; } catch { return requestOrigin; } })();
  if (origin !== requestOrigin && origin !== configuredOrigin) throw new Error("CROSS_ORIGIN_MUTATION_BLOCKED");
}

export function safeJson<T>(value: T): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function signServerState(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyServerState<T extends Record<string, unknown>>(token: string): T | null {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) return null;
  const expected = createHmac("sha256", SESSION_SECRET).update(encoded).digest("base64url");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T; } catch { return null; }
}

export function publicApiError(error: unknown, fallback: string): string {
  const code = error instanceof Error ? error.message : "";
  const known: Record<string,string> = {
    UNAUTHORIZED: "Sign in again to continue.",
    RAZORPAY_NOT_CONFIGURED: "Razorpay Test Mode is not configured.",
    RAZORPAY_TEST_MODE_REQUIRED: "Only Razorpay Test Mode is allowed in this build.",
    OPENROUTER_NOT_CONFIGURED: "Invoice AI is not configured.",
    PROCUREMENT_PRODUCT_NOT_SUPPORTED: "That product is not in the connected demo catalog yet.",
    PROCUREMENT_RUN_NOT_READY: "The procurement plan is no longer available. Compare again.",
    PROCUREMENT_PLAN_EXPIRED: "The supplier plan expired. Compare again before paying.",
    PROCUREMENT_PLAN_NO_LONGER_SAFE: "Supplier price, stock, or policy changed. Compare again before paying.",
    PROCUREMENT_PRICE_CHANGED_RECOMPARE: "Supplier price changed. Compare again before paying.",
    SUPPLIER_INVENTORY_RESERVATION_FAILED: "The selected supplier stock changed. Compare again.",
    PROCUREMENT_RESERVATION_EXPIRED_RECOMPARE: "The supplier reservation expired. Compare again.",
    CROSS_ORIGIN_MUTATION_BLOCKED: "Request origin was rejected."
  };
  return known[code] ?? fallback;
}
