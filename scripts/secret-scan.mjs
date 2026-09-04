import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const skippedDirectories = new Set(["node_modules", ".next", ".git", ".run", ".data"]);
// Local environment files are deliberately untracked secret stores. The example
// file is still scanned so a distributable template cannot accidentally contain
// a real credential.
const isLocalSecretFile = (name) => name === ".env" || name === ".env.local" || /^\.env\..+\.local$/.test(name);
const patterns = [
  /rzp_(?:test|live)_[A-Za-z0-9]{10,}/g,
  /sk-or-v1-[A-Za-z0-9]{20,}/g,
  /OPENROUTER_API_KEY\s*=\s*["']?sk-/g,
  /RAZORPAY_KEY_SECRET\s*=\s*["']?[A-Za-z0-9]{12,}/g,
];
const hits = [];

function walk(directory) {
  for (const name of readdirSync(directory)) {
    if (skippedDirectories.has(name) || isLocalSecretFile(name)) continue;
    const path = join(directory, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path);
      continue;
    }
    if (stats.size >= 2_000_000 || name.endsWith(".pdf") || name.endsWith(".docx")) continue;
    const contents = readFileSync(path, "utf8");
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      if (pattern.test(contents)) hits.push(`${relative(root, path)}: ${pattern}`);
    }
  }
}

walk(root);
if (hits.length) {
  console.error(`Potential secret leak(s):\n${hits.join("\n")}`);
  process.exit(1);
}
console.log("Secret scan PASS");
