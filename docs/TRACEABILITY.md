# Track 01 / Build-Spec Traceability

This file maps the authoritative `BUILD_SPEC.md` into implementation surfaces so nothing important exists only as pitch copy.

| Requirement | Implementation |
|---|---|
| Merchant state machine-readable | `/api/dashboard`, server domain models, typed product/inventory/evidence state |
| Observe only after agent query | Shadow Funnel screen + `AGENT_QUERY_RECEIVED` audit boundary |
| No LLM arithmetic | `lib/engines/accounting.ts`, `policy.ts`; Decimal-only deterministic computation |
| HARD UNKNOWN fails closed | `lib/engines/constraints.ts` + unit tests |
| GST capability current authority | `currentGstCapability()` from merchant tax configuration |
| FSC document can unblock only while valid/in-scope | `verifyFscCertificate()` with deterministic date/scope checks |
| Minimum viable discount must be searched | `minimumDiscountBpsToMeetBudget()` + Candidate A' test |
| Contribution margin floor | `policy.ts`, frozen at 23% in demo config |
| Per-location atomic reservation | `inventory_location` + guarded SQLite `UPDATE` |
| Reservation TTL / late payment safety | `releaseExpiredReservations()` + `PAID_REQUIRES_RECONCILIATION` |
| Offer/policy binding | offer SHA-256 + server-side policy decision record |
| Razorpay order created server-side | `/api/checkout/start` |
| Client cannot choose amount | checkout route loads amount from approved offer only |
| Checkout signature verified | `/api/checkout/verify` |
| Payment/order amount + currency rechecked | `/api/checkout/verify` fetches Razorpay entities |
| Webhook raw-body HMAC | `/api/webhooks/razorpay` |
| Webhook dedupe | `x-razorpay-event-id` persisted uniquely |
| Graceful failure | Live Buyer → contention test; second reservation fails without creating payment |
| Audit trail | `audit_events` + Audit screen |
| Paired deterministic control | `lib/replay.ts` + Opportunities screen |
| Primary economic metric | Net incremental contribution |

## Deliberate implementation boundary

This hackathon ZIP uses SQLite for one local/server instance so setup is one command. The domain APIs are separated so production persistence can move to PostgreSQL without moving financial authority into the browser.


| Requirement | Implementation |
|---|---|
| External buyer surface / observability boundary | Bearer-protected `/api/agent/catalog` and `/api/agent/evaluate`; only contacted queries are auditable |
| External evaluation cannot spend | Agent endpoints evaluate only; inventory reservation and Razorpay order creation remain on merchant-authorized server flow |

| External non-binding offer preview | Bearer-protected `/api/agent/offer`; no reservation/payment authority |
| Merchant Truth uploads | `/api/evidence/upload` + strict MIME/size/hash + deterministic FSC verification |
| Persisted isolated/stateful replay | `/api/replay/run`, `replay_runs`, `replay_results` |
| Single-fix + observed multi-fix opportunity analysis | `lib/replay.ts` and Opportunities screen |
| Login throttling | `login_attempts` + hashed email/source key |
| Checkout current-state revalidation | `/api/checkout/start` rechecks evidence, cost, offer/policy/reservation binding |
