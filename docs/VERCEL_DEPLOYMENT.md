# Vercel deployment

## What works
The project is a standard Next.js App Router application and includes `vercel.json`. Add the repository to Vercel and configure the environment variables from `.env.example`. Do **not** upload `.env.local`.

Required production variables: `DEMO_EMAIL`, `DEMO_PASSWORD` (16+ chars), `SESSION_SECRET` (32+ chars), and `AGENT_API_TOKEN`. Set `PAYMENT_MODE=demo` for the public account-free simulator. Add `OPENROUTER_API_KEY` only for real invoice extraction; the bundled invoice demo does not need it.

Set `APP_ORIGIN` to the final HTTPS deployment URL, e.g. `https://your-app.vercel.app`.

## Database limitation
Vercel's project filesystem is read-only and `/tmp` is ephemeral. This release automatically uses `/tmp/razorprocure.db` on Vercel so the UI and demo APIs can boot safely, but **this is a demo deployment mode, not durable multi-user persistence**. Cold starts/function isolation can reset state. For a real multi-user production deployment, migrate the DB adapter to a durable service such as Neon/Postgres or Turso/libSQL and move login throttling/audit/payment state there. Local Windows mode uses durable SQLite and is the recommended hackathon demo path.

## Deploy
1. Push this folder to a private Git repository.
2. Import it in Vercel.
3. Add the environment variables in Project Settings -> Environment Variables.
4. Deploy.
5. Confirm `/api/health` reports `paymentMode: "demo"` and `externalPaymentConnected: false`.

## Public payment safety
The default demo path generates dummy order and payment identifiers on the server, commits only an already-authorized reservation, and records `externalNetworkCall: false` in the audit event. It does not load Razorpay Checkout, call Razorpay APIs, accept webhooks, or require payment credentials. Even if old Razorpay variables remain in Vercel, they are ignored unless `PAYMENT_MODE=razorpay_test` is explicitly selected. Inventory/audit persistence remains ephemeral until an external database is configured.

## Optional private Test Mode
The Razorpay adapter is retained for private/local integration testing only. Enabling it requires the explicit `PAYMENT_MODE=razorpay_test` setting plus Test Mode credentials. Live-mode key IDs are rejected. Do not enable this mode on a public shared demo unless you intentionally want the deployment to contact the Razorpay Test Mode API.
