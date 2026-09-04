# Operations runbook

## Windows launch

1. Run `configure.bat` once.
2. Run `verify.bat` for the release gate.
3. Run `start.bat`. It stops only a previously recorded RazorProcure process, selects the first free port from 3100–3199, writes `.run/server.port`, waits for `/api/health`, and opens the exact URL.
4. Run `show-login.bat` for the locally generated credentials.
5. Run `stop.bat` to stop only the PID tree proven to belong to this project.

Logs are in `.run/server.log` and `.run/server-error.log`. Runtime PID/port files are local and ignored by Git.

## Release checks

```bash
npm ci
npm run verify
```

`verify` runs secret scanning, TypeScript, ESLint, unit/integration tests, a production build and a high-severity dependency audit. `runtime-smoke.mjs` performs authenticated API workflow checks against a running instance.

After `start.bat`, run `npm run smoke`; it automatically reads `.run/server.port`.

## Payment modes

- `PAYMENT_MODE=demo` is the safe default. No Razorpay script, API, secret or account is used.
- `PAYMENT_MODE=razorpay_test` is an intentional private-only adapter. It rejects non-test key IDs and fails closed if credentials or authoritative verification are missing.
- `npm run payments:disconnect` removes local Razorpay variables and restores demo mode.

Never put credentials in Git, screenshots, support logs, client components or README files. Rotate a secret immediately if it is exposed.

## Recovery

- Stale PID: `stop.bat` removes stale state if no process exists; it refuses an unrelated PID.
- Busy port: restart with `start.bat`; the next free allowed port is chosen.
- Expired plan/reservation: compare again. The application does not reuse stale authorization.
- Payment/provider ambiguity: keep fulfilment uncommitted and inspect Audit. Never manually label an uncertain payment as verified.
- Disposable Vercel state: redeploy/reset the demo. Durable production use requires a managed transactional database.
