# RazorProcure architecture

## Product workflow
Invoice/Purchase History -> Purchase Memory -> Smart Buy -> Supplier normalization -> Deterministic landed-cost + policy checks -> Atomic reservation -> Razorpay Test Order -> Server verification -> Purchase Memory + Audit.

## Trust boundary
The browser and LLM are untrusted. They can request or extract data, but cannot choose authoritative prices, margins, policy results, inventory state, Razorpay order amounts, or payment success.

## Modules
- `app/`: UI and server routes
- `components/`: merchant-facing workflow UI
- `lib/procurement.ts`: supplier comparison, plan revalidation, reservations, purchase memory
- `lib/engines/`: accounting, constraints, evidence, policy
- `lib/razorpay.ts`: Razorpay client + cryptographic verification
- `lib/db.ts`: local SQLite schema/seed
- `lib/openrouter.ts`: invoice extraction only
- `lib/audit.ts`: safe structured audit events
- `tests/`: deterministic domain and security tests

## Deployment modes
Local Windows uses durable SQLite under `.data/`. Vercel demo mode uses ephemeral `/tmp`; see `VERCEL_DEPLOYMENT.md`.
