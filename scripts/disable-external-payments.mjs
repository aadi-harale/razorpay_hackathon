import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = resolve(process.cwd(), ".env.local");
if (!existsSync(target)) {
  console.log("No .env.local file exists. Demo payments are already the safe default.");
  process.exit(0);
}

let text = readFileSync(target, "utf8");
const values = {
  PAYMENT_MODE: "demo",
  RAZORPAY_KEY_ID: "",
  RAZORPAY_KEY_SECRET: "",
  RAZORPAY_WEBHOOK_SECRET: "",
  NEXT_PUBLIC_RAZORPAY_KEY_ID: ""
};

for (const [name, value] of Object.entries(values)) {
  const nextLine = `${name}="${value}"`;
  const linePattern = new RegExp(`^${name}=.*$`, "m");
  text = linePattern.test(text) ? text.replace(linePattern, nextLine) : `${text.trimEnd()}\n${nextLine}\n`;
}

writeFileSync(target, text, { mode: 0o600 });
console.log("External payment credentials were cleared from .env.local. PAYMENT_MODE=demo is active.");
