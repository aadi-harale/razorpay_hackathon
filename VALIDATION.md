# Release validation

Run `verify.bat` on Windows after extraction. It fails closed if any gate fails.

1. Secret scan
2. TypeScript typecheck
3. ESLint
4. Vitest unit/integration tests
5. Next.js production build
6. `npm audit --audit-level=high`

The archive should never include `.env.local`, `.run`, `.data`, `.next`, or `node_modules`.

The final manual acceptance path is: login -> invoice/purchase memory -> Smart Buy -> safe supplier selected -> reservation -> Razorpay Test Checkout -> verified payment -> Audit.
