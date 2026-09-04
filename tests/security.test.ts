import { describe, expect, it } from "vitest";
import { enforceSameOrigin, signServerState, verifyServerState } from "@/lib/security";

describe("request and server-state security",()=>{
  it("accepts the actual local launch port even when APP_ORIGIN differs",()=>{
    const request=new Request("http://localhost:3187/api/demo/run",{method:"POST",headers:{origin:"http://localhost:3187",host:"localhost:3187"}});
    expect(()=>enforceSameOrigin(request)).not.toThrow();
  });

  it("rejects a cross-origin mutation",()=>{
    const request=new Request("http://localhost:3187/api/demo/run",{method:"POST",headers:{origin:"https://attacker.example",host:"localhost:3187"}});
    expect(()=>enforceSameOrigin(request)).toThrow("CROSS_ORIGIN_MUTATION_BLOCKED");
  });

  it("detects tampering in signed server state",()=>{
    const token=signServerState({merchantId:"m_demo",exp:Date.now()+60_000});
    expect(verifyServerState(token)?.merchantId).toBe("m_demo");
    const replacement=token.endsWith("x")?"y":"x";
    expect(verifyServerState(`${token.slice(0,-1)}${replacement}`)).toBeNull();
  });
});
