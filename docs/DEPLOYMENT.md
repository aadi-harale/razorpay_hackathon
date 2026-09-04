# Deployment

## Public hackathon demo

The supported public profile is account-free:

1. Import the GitHub repository into Vercel.
2. Use Node.js 22+ and the included `vercel.json`.
3. Set strong `DEMO_EMAIL`, `DEMO_PASSWORD`, `SESSION_SECRET` and `AGENT_API_TOKEN` environment variables.
4. Set `PAYMENT_MODE=demo`.
5. Leave every `RAZORPAY_*` and `NEXT_PUBLIC_RAZORPAY_*` variable unset.
6. Optionally set `LLM_PROVIDER`, `OPENROUTER_API_KEY` and `OPENROUTER_MODEL`; the bundled invoice demo remains deterministic without them.
7. Deploy, then verify `/api/health` reports `paymentMode: "demo"` and `externalPaymentConnected: false`.

Live demo: <https://razorpay-hackathon-phi.vercel.app/>

## Production boundary

Vercel demo storage is ephemeral SQLite under `/tmp`. Before accepting real merchant data or money, replace it with a managed transactional database, add encrypted secret management, backups, retention controls, monitoring and an incident runbook. Private Razorpay Test Mode may be exercised only after explicit opt-in and secret rotation; live-mode keys are rejected by this repository.

See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for platform details and [RAZORPAY_SETUP.md](./RAZORPAY_SETUP.md) for the isolated private adapter.

