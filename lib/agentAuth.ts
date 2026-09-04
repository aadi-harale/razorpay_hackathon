import { safeSecretEqual } from "@/lib/security";

export function requireAgentToken(request: Request) {
  const expected = process.env.AGENT_API_TOKEN;
  if (!expected || expected.length < 24) throw new Error("AGENT_API_NOT_CONFIGURED");
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !safeSecretEqual(match[1], expected)) throw new Error("AGENT_UNAUTHORIZED");
}
