import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env.local');
const examplePath = resolve(root, '.env.example');
const args = new Set(process.argv.slice(2));

// One and only one local demo account. Existing valid credentials remain stable
// across restarts; reset-login.bat explicitly rotates the password.
const DEFAULT_LOCAL_EMAIL = 'merchant@razorprocure.local';

if (!existsSync(envPath)) {
  if (!existsSync(examplePath)) throw new Error('.env.example is missing');
  writeFileSync(envPath, readFileSync(examplePath, 'utf8'));
}

let lines = readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);

function readValue(name) {
  const prefix = `${name}=`;
  const line = lines.find((entry) => entry.trimStart().startsWith(prefix));
  if (!line) return '';
  let value = line.slice(line.indexOf('=') + 1).trim();
  if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
  return value.replace(/\\"/g, '"');
}

function setValue(name, value) {
  const escaped = String(value).replace(/"/g, '\\"');
  const next = `${name}="${escaped}"`;
  const idx = lines.findIndex((entry) => entry.trimStart().startsWith(`${name}=`));
  if (idx >= 0) lines[idx] = next;
  else lines.push(next);
}

function secretInvalid(value, min = 32) {
  return !value || value.length < min || value.includes('replace-with') || value.includes('dev-only');
}

let email = readValue('DEMO_EMAIL').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) email = DEFAULT_LOCAL_EMAIL;

let password = readValue('DEMO_PASSWORD');
const passwordRotated = args.has('--rotate-password');
if (passwordRotated || secretInvalid(password, 16)) password = randomBytes(18).toString('base64url');

// Keep the local launcher on its dedicated origin without weakening configured
// credentials or changing the account on every restart.
setValue('APP_ORIGIN', 'http://localhost:3100');
setValue('DEMO_EMAIL', email);
setValue('DEMO_PASSWORD', password);

let sessionSecret = readValue('SESSION_SECRET');
if (secretInvalid(sessionSecret, 32)) {
  sessionSecret = randomBytes(48).toString('base64url');
  setValue('SESSION_SECRET', sessionSecret);
}

let agentToken = readValue('AGENT_API_TOKEN');
if (secretInvalid(agentToken, 24)) {
  agentToken = randomBytes(32).toString('base64url');
  setValue('AGENT_API_TOKEN', agentToken);
}

writeFileSync(envPath, `${lines.join('\r\n').replace(/(?:\r?\n)+$/, '')}\r\n`, { mode: 0o600 });

// There is no users table: local auth is exactly the environment identity above.
// Session/lockout deletion is reserved for an explicit unlock or password reset.
const databaseUrl = readValue('DATABASE_URL') || 'file:./.data/razorprocure.db';
if ((args.has('--unlock') || passwordRotated) && databaseUrl.startsWith('file:')) {
  const raw = databaseUrl.slice(5);
  const dbPath = resolve(root, raw);
  if (existsSync(dbPath)) {
    try {
      const mod = await import('better-sqlite3');
      const Database = mod.default;
      const db = new Database(dbPath);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sessions','login_attempts')").all();
      const names = new Set(tables.map((row) => row.name));
      if (names.has('sessions')) db.prepare('DELETE FROM sessions').run();
      if (names.has('login_attempts')) db.prepare('DELETE FROM login_attempts').run();
      db.close();
      console.log('[RazorProcure] Cleared all previous local sessions/login lockouts.');
    } catch (error) {
      console.warn('[RazorProcure] Could not clear local auth state:', error instanceof Error ? error.message : String(error));
    }
  }
}

console.log('[RazorProcure] Single local retailer account synchronized.');
console.log(`  Email: ${email}`);
if (passwordRotated) console.log('  Password rotated. Run show-login.bat to display it.');
