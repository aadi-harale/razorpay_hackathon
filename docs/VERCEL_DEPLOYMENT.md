# Vercel deployment

## What works
The project is a standard Next.js App Router application and includes `vercel.json`. Add the repository to Vercel and configure the environment variables from `.env.example`. Do **not** upload `.env.local`.

Required production variables: `DEMO_EMAIL`, `DEMO_PASSWORD` (16+ chars), `SESSION_SECRET` (32+ chars), `AGENT_API_TOKEN`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `NEXT_PUBLIC_RAZORPAY_KEY_ID`. Add `RAZORPAY_WEBHOOK_SECRET` when webhooks are enabled. Add `OPENROUTER_API_KEY` only for invoice extraction.

Set `APP_ORIGIN` to the final HTTPS deployment URL, e.g. `https://your-app.vercel.app`.

## Database limitation
Vercel's project filesystem is read-only and `/tmp` is ephemeral. This release automatically uses `/tmp/razorprocure.db` on Vercel so the UI and demo APIs can boot safely, but **this is a demo deployment mode, not durable multi-user persistence**. Cold starts/function isolation can reset state. For a real multi-user production deployment, migrate the DB adapter to a durable service such as Neon/Postgres or Turso/libSQL and move login throttling/audit/payment state there. Local Windows mode uses durable SQLite and is the recommended hackathon demo path.

## Deploy
1. Push this folder to a private Git repository.
2. Import it in Vercel.
3. Add the environment variables in Project Settings -> Environment Variables.
4. Deploy.
5. Configure the Razorpay webhook URL as `https://YOUR_DOMAIN/api/webhooks/razorpay` and set the same webhook secret in Vercel.

## Stateless safety fallback
The Vercel demo path uses signed server-state tokens for the merchant session and for Razorpay payment authorization. The token binds the Razorpay order ID, expected amount, currency, merchant, supplier context and expiry. The verification endpoint still verifies the Checkout HMAC and independently fetches Razorpay Payment/Order state before success. This makes the checkout demo resilient to function-instance changes without trusting browser-supplied money. Inventory/audit persistence remains ephemeral until an external database is configured.
