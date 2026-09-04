# RazorProcure

**AI procurement for retailers, powered by the ShadowFunnel safety kernel.** RazorProcure learns recurring purchase behavior, compares connected suppliers on true landed cost, verifies policy/stock/GST constraints, and executes approved purchases through Razorpay Test Mode.

## Local single-user login

The Windows/local build intentionally has exactly **one** retailer login:

- Email: `merchant@razorprocure.local` by default
- Password: generated securely on first launch; run `show-login.bat` to display it

`start.bat` keeps the configured single-user credentials stable across restarts. It does **not** delete sessions, procurement, inventory, payment, or audit data. `reset-login.bat` rotates the local password and clears only sessions/login-rate-limit state; it never creates a second user. For Vercel/production, configure separate strong credentials using environment variables.


## Quick start (Windows)
1. Extract the ZIP to a fresh folder.
2. Install Node.js 22+.
3. Double-click `configure.bat` to create local secrets and optionally add Razorpay/OpenRouter credentials.
4. Double-click `start.bat`. It performs a fresh production build and opens `http://localhost:3100`.
5. Use `show-login.bat` if you need the generated local password.
6. Double-click `stop.bat` to stop only RazorProcure.
7. Run `verify.bat` before a demo/submission.

## Core workflow
**Home -> Purchase Memory -> Smart Buy -> Savings Insights -> Audit**

Smart Buy executes: request -> product normalization -> connected supplier comparison -> deterministic landed cost -> budget/GST/delivery/inventory/spend gates -> supplier reservation -> server-created Razorpay Order -> checkout signature verification -> Razorpay API status verification -> reservation commit -> purchase memory/audit.

`Try demo invoice` is deliberately deterministic: the exact bundled sample image is checksum-verified and mapped to its three visible line items without requiring a network call. Uploaded merchant invoices still use the configured OpenRouter model. Re-importing the same invoice is idempotent and will not duplicate purchase history.

## Security
No real secrets are packaged. `.env.local`, `.run`, `.data`, `.next`, and `node_modules` are excluded. The browser never supplies authoritative payment amount. LLM output is schema-validated and cannot authorize money, evidence, inventory, or payment. See `SECURITY.md`.

## Vercel
The source is Vercel-build ready and includes `vercel.json`. Vercel demo mode uses ephemeral `/tmp` SQLite because Vercel does not provide persistent local filesystem storage. For durable production data, migrate the DB adapter to Postgres/Neon or Turso. See `docs/VERCEL_DEPLOYMENT.md`.

## Validation
Run `verify.bat`: secret scan -> TypeScript -> ESLint -> Vitest -> Next production build -> npm audit. See `VALIDATION.md`.

## Login recovery

If the login page rejects credentials, do **not** edit the database or source. Run `reset-login.bat`. It stops the local server, rotates the local retailer password, clears only the local login-rate-limit state, then starts RazorProcure again. `show-login.bat` always reads the exact credentials from `.env.local`, so the displayed password and server password cannot drift.

Always open the exact local URL printed by `start.bat` (normally `http://localhost:3100`).
