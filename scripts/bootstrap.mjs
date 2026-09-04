import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

const root=resolve(process.cwd());
const target=resolve(root,".env.local");
const example=resolve(root,".env.example");
const email="merchant@razorprocure.local";
const password=randomBytes(18).toString("base64url");

if(existsSync(target)){console.log(".env.local already exists; synchronizer will normalize local auth.");process.exit(0);}
let text=readFileSync(example,"utf8");
const sessionSecret=randomBytes(48).toString("base64url");
const agentToken=randomBytes(32).toString("base64url");
text=text.replace('APP_ORIGIN="http://localhost:3100"','APP_ORIGIN="http://localhost:3100"');
text=text.replace('DEMO_EMAIL="merchant@razorprocure.local"',`DEMO_EMAIL="${email}"`);
text=text.replace('DEMO_PASSWORD="replace-with-strong-local-password"',`DEMO_PASSWORD="${password}"`);
text=text.replace('SESSION_SECRET="replace-with-64-char-random-secret"',`SESSION_SECRET="${sessionSecret}"`);
text=text.replace('AGENT_API_TOKEN="replace-with-random-agent-token"',`AGENT_API_TOKEN="${agentToken}"`);
writeFileSync(target,text,{mode:0o600});
console.log("Created .env.local with one fixed local retailer account and randomized server secrets.");
console.log(`Retailer login: ${email} / ${password}`);
console.log("Add Razorpay Test Mode and OpenRouter credentials before the live demo.");
