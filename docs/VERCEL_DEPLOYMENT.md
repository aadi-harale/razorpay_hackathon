# Vercel deployment

## What works
The project is a standard Next.js App Router application and includes `vercel.json`. Add the repository to Vercel and configure the environment variables from `.env.example`. Do **not** upload `.env.local`.

Required production variables: `DEMO_EMAIL`, `DEMO_PASSWORD` (16+ chars), `SESSION_SECRET` (32+ chars), `AGENT_API_TOKEN`, and `POSTGRES_URL`. Set `PAYMENT_MODE=demo` for the public account-free simulator. Add `OPENROUTER_API_KEY` only for real invoice extraction; the bundled invoice demo does not need it.

Set `APP_ORIGIN` to the final HTTPS deployment URL, e.g. `https://your-app.vercel.app`.

## Durable Supabase state
Vercel's writable `/tmp` directory is ephemeral, so production runtime restores a checksummed SQLite snapshot from Supabase Postgres before opening the database. Every audited state transition schedules a version-checked checkpoint back to Postgres; reset and login-throttle mutations checkpoint explicitly. This preserves the existing transactional SQLite safety kernel while making the single-user deployment survive cold starts.

Run `npm run db:bootstrap:supabase` once locally after setting `POSTGRES_URL` to create the snapshot table and upload the verified starting state. On Vercel, use Supabase's transaction-pooler URL on port `6543`; its direct database hostname is IPv6-only on projects without the IPv4 add-on. `/api/health` must then report `storageMode: "supabase_durable_snapshot"`.

This adapter is intentionally scoped to the single-user application. A future multi-tenant release should use row-native Postgres repositories rather than whole-workspace snapshots.

## Deploy
1. Push this folder to a private Git repository.
2. Import it in Vercel.
3. Add the environment variables in Project Settings -> Environment Variables.
4. Deploy.
5. Confirm `/api/health` reports `paymentMode: "demo"`, `externalPaymentConnected: false`, and `storageMode: "supabase_durable_snapshot"`.

## Public payment safety
The default demo path generates dummy order and payment identifiers on the server, commits only an already-authorized reservation, and records `externalNetworkCall: false` in the audit event. It does not load Razorpay Checkout, call Razorpay APIs, accept webhooks, or require payment credentials. Even if old Razorpay variables remain in Vercel, they are ignored unless `PAYMENT_MODE=razorpay_test` is explicitly selected.

## Optional private Test Mode
The Razorpay adapter is retained for private/local integration testing only. Enabling it requires the explicit `PAYMENT_MODE=razorpay_test` setting plus Test Mode credentials. Live-mode key IDs are rejected. Do not enable this mode on a public shared demo unless you intentionally want the deployment to contact the Razorpay Test Mode API.
