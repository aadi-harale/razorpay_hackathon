# Release validation

Run `verify.bat` on Windows after extraction. It fails closed if any gate fails.

1. Secret scan
2. TypeScript typecheck
3. ESLint
4. Vitest unit/integration tests
5. Next.js production build
6. `npm audit --audit-level=high`

The archive should never include `.env.local`, `.run`, `.data`, `.next`, or `node_modules`.

## Verified 2026-09-04

- `npm run verify`: PASS — secret scan, TypeScript, ESLint, 51/51 Vitest tests, Next.js production build and dependency audit.
- `npm run smoke`: PASS against a fresh production server — login, invoice idempotency, multi-supplier basket, flagship offer, dummy checkout, atomic race/replan, replay and audit.
- Windows dynamic-port behavior: PASS — with 3100 occupied, RazorProcure selected and served on 3101; after release it returned to 3100.
- Manual browser walkthrough at 1280-class desktop width: PASS — exactly five primary navigation items, invoice demo, manual purchase, supplier comparison, basket optimizer, dummy purchase, graceful failure/replan, savings and audit.
- Public profile: PASS for account-free demo mode; `/api/health` must report `externalPaymentConnected: false`.
- Live Razorpay Test Order, provider-state fetch and webhook delivery: **NOT VERIFIED** because external payment credentials are intentionally disconnected from the public profile.

Final strict master-gate verdict: **NOT READY for live external payments**. Do not create the final production ZIP until the isolated private Razorpay Test Mode checks and the remaining 1440×900 visual pass are executed. The account-free hackathon demo is release-ready within its documented boundary.

The final safe-demo acceptance path is: login → invoice/purchase memory → Smart Buy → compare or optimize basket → approved supplier → atomic reservation → dummy verified payment → Audit. The private Razorpay path remains a separate opt-in validation profile.
