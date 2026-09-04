# Deployment

## Public hackathon demo

The supported public profile is account-free:

1. Import the GitHub repository into Vercel.
2. Use Node.js 22+ and the included `vercel.json`.
3. Set strong `DEMO_EMAIL`, `DEMO_PASSWORD`, `SESSION_SECRET` and `AGENT_API_TOKEN` environment variables.
4. Set `POSTGRES_URL` to the Supabase transaction-pooler SSL connection string (port `6543`) for Vercel. The direct connection may be used by the one-time local `npm run db:bootstrap:supabase` command on an IPv6-capable machine.
5. Set `PAYMENT_MODE=demo`.
6. Leave every `RAZORPAY_*` and `NEXT_PUBLIC_RAZORPAY_*` variable unset.
7. Optionally set `LLM_PROVIDER`, `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`; the bundled invoice demo remains deterministic without them.
8. Deploy, then verify `/api/health` reports `paymentMode: "demo"`, `externalPaymentConnected: false` and `storageMode: "supabase_durable_snapshot"`.

Live demo: <https://razorpay-hackathon-phi.vercel.app/>

## Production boundary

The single-user Vercel deployment restores and checkpoints a versioned, checksummed SQLite workspace snapshot through Supabase Postgres, so demo state survives cold starts. It is not a row-native multi-tenant database layer. Before accepting real merchant data or money, migrate repositories to row-native Postgres, add encrypted secret management, managed backups, retention controls, monitoring and an incident runbook. Private Razorpay Test Mode may be exercised only after explicit opt-in and secret rotation; live-mode keys are rejected by this repository.

See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for platform details and [RAZORPAY_SETUP.md](./RAZORPAY_SETUP.md) for the isolated private adapter.
