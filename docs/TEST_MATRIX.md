# Acceptance test matrix

The canonical release command is `npm run verify`. Do not convert `NOT VERIFIED` into `PASS` without executing the named evidence.

| Capability | Automated evidence | Manual evidence |
|---|---|---|
| Authentication and origin controls | `tests/security.test.ts` | Sign in, sign out, rejected unauthenticated API |
| Decimal accounting and tax | `tests/accounting.test.ts`, `tests/realized-accounting.test.ts` | Inspect the Smart Buy cost stack |
| Policy boundaries | `tests/policy.test.ts`, `tests/constraints.test.ts` | Run blocked budget and approval scenarios |
| Evidence freshness | `tests/evidence.test.ts` | Import bundled certificate and inspect provenance |
| Invoice ingestion | `tests/demo-invoice.test.ts`, `tests/invoice-ingestion.test.ts` | Try sample image, CSV/XLSX and manual purchase |
| Product identity | `tests/procurement.test.ts` | Try exact, high-confidence, ambiguous and incompatible prompts |
| Supplier and basket optimization | `tests/procurement.test.ts` | Smart Buy → Optimize 3-item basket |
| Counterfactual plan resilience | `tests/resilience.test.ts`, `npm run smoke` | Smart Buy → Compare → Stress-test this plan |
| Atomic inventory and replan | `tests/inventory.test.ts`, `tests/procurement-reservation.test.ts` | Smart Buy → Inventory race |
| Offer binding | `tests/offers.test.ts` | Run full demo and inspect Audit |
| Payment signatures | `tests/payment-signatures.test.ts` | Demo payment locally; private live Test Mode remains separate |
| Three-way receiving match | `tests/reconciliation.test.ts`, `npm run smoke` | Smart Buy → purchase → verify exact delivery / test supplier discrepancy |
| Replay reproducibility | `tests/replay.test.ts` | Savings Insights → Run paired replay |
| Production compilation | `npm run typecheck`, `npm run lint`, `npm run build` | Inspect 1440×900 and 1280-wide layouts |
| Dependency/security baseline | `npm run secret-scan`, `npm audit --audit-level=high` | Confirm deployment environment contains no payment credentials |

Live Razorpay Test Order creation, provider fetch verification and webhook delivery are `NOT VERIFIED` whenever the account-free demo profile is active. This is intentional and must remain visible in a release report.
