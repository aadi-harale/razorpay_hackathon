# ShadowFunnel — Build Specification

You are implementing ShadowFunnel for the Razorpay AI Buildathon 2026, Track 01.
Read this file fully before writing code. It is authoritative. Where this file
and any other document disagree, this file wins.

---

## 0. Standing rules

1. **Never invent a number.** Every rupee figure that appears in code, UI or README must be either (a) a constant defined in §2, (b) computed by the engines in §3, or (c) produced by a replay run. If you find yourself typing a plausible-looking figure, stop and ask.
2. **No LLM does arithmetic.** No model computes a total, margin, tax, discount or fee. Models parse language and extract candidate facts. Deterministic code decides everything with money in it.
3. **Fail closed.** Missing data, an unresolved HARD constraint, an expired offer, a failed reservation, or a status mismatch all block. Never degrade to a permissive default.
4. **Stop at the gates in §8.** Do not start a phase until the previous phase's tests pass. If you are running out of time, cut from the end of §8, never from P0.
5. **When uncertain, ask rather than assume** — especially about Razorpay API behaviour, GST treatment, or anything where a wrong guess is invisible. Verify against official Razorpay docs, not memory.

---

## 1. What this is

A merchant is exposed to autonomous AI buyers. ShadowFunnel:

- makes merchant state machine-readable so an agent can evaluate it,
- records why an agent that queried the merchant did not convert,
- forms the safest economically valid offer that can recover an eligible rejection,
- executes payment through Razorpay Test Mode with server-side verification.

**Claim boundary, enforced in code and copy.** We observe agents only *after*
they contact the merchant's commerce surface. Agents that eliminate the
merchant before querying are not observable and are never counted or inferred.
Every rejection reason carries provenance: `OBSERVED`, `INFERRED`, or `UNKNOWN`.
Never write UI text implying visibility into agents that never queried us.

---

## 2. Frozen demo configuration

These are configuration, not hardcoded logic. Load from a config module; the
engines must work with different values.

| Key Value                          |                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------- |
| Catalog prices                     | GST-inclusive                                                              |
| Buyer budget semantics             | Final gross payable, GST-inclusive                                         |
| Output GST rate (demo basket)      | 18%                                                                        |
| SKU                                | `BX-104`, ₹399 gross per unit                                              |
| Basket                             | 20 units → ₹7,980.00 gross merchandise                                     |
| Supplier purchase price (20 units) | ₹5,428.00 gross                                                            |
| Input GST recoverable              | true → **economic COGS = ₹4,600.00** (5,428 / 1.18)                        |
| Gateway platform fee               | 3% (B2B corporate card is plausible for this order)                        |
| GST on gateway fee                 | 18%, recoverable per merchant config → economic processor cost = **3.00%** |
| **Contribution margin floor**      | **23.00%**                                                                 |
| Autonomous discount cap            | 4%                                                                         |
| Approval band                      | >4% to ≤5%                                                                 |
| Hard discount cap                  | 5% (above this: blocked outright)                                          |

### Fulfilment nodes

| Node Stock Economic fulfilment cost Buyer shipping charge Role  |    |         |         |                                                                                |
| --------------------------------------------------------------- | -- | ------- | ------- | ------------------------------------------------------------------------------ |
| `WH-MUM-CENTRAL`                                                | 47 | ₹450.00 | ₹250.00 | Default B2B route                                                              |
| `WH-PNQ-EDGE`                                                   | 24 | ₹60.00  | ₹0.00   | Scarce local node; usable only when the default route would lose a valid buyer |

> **Floor changed from 22% to 23%.** At a 22% floor the minimum viable discount
> on the central route lands at 21.97% — three hundredths of a point from
> passing. A judge who asks "why 3% and not the minimum?" reaches that number in
> one step. At 23% every decision below clears by more than a percentage point.
> If you change the floor back, recompute §4 and update the tests.

---

## 3. Accounting model — frozen, implement exactly

```
gross_customer_payable = Σ(gross line prices after discounts) + buyer_shipping_charge
output_tax             = tax_engine(gross lines, configured rates)
net_sales_revenue      = gross_customer_payable − output_tax

economic_COGS           = supplier gross cost − recoverable input tax
economic_fulfilment     = merchant-borne carrier/handling cost for the chosen route
economic_processor_cost = platform fee + non-recoverable fee tax

contribution        = net_sales_revenue
                    − economic_COGS
                    − economic_fulfilment
                    − economic_processor_cost
                    − other merchant-borne variable costs

contribution_margin = contribution / net_sales_revenue

```

**Rules that are easy to get wrong:**

- A discount already lowered the selling price. Do **not** subtract it again as a promotion cost.
- Buyer-charged shipping is revenue; merchant-paid carrier cost is a separate fulfilment cost. Both go through the formula.
- One denominator — `net_sales_revenue` — for every candidate. No candidate gets a different basis.
- Tax recoverability is merchant configuration, never a universal assumption. Apply the same ITC rule to COGS and to the gateway fee, or to neither.

**Numeric discipline.** Money is `Decimal`, never float. Quantize every
component to 2dp with `ROUND_HALF_UP` **before** summing. Compare margins at 4
decimal places. Store money as integer paise where persisted.

---

## 4. Golden test vectors — must reproduce exactly

Write these as unit tests **first**, before any engine code. They are the
contract. If a refactor breaks one, the refactor is wrong.

Buyer intent: *20 FSC-certified corporate gift boxes, final payable ≤ ₹8,000,
deliver to Pune by Monday, GST invoice required.*

| Case Gross payable Net revenue Fulfilment Processor Contribution Margin Result  |           |           |         |         |           |            |                                                   |
| ------------------------------------------------------------------------------- | --------- | --------- | ------- | ------- | --------- | ---------- | ------------------------------------------------- |
| Baseline (central, no discount)                                                 | ₹8,230.00 | ₹6,974.58 | ₹450.00 | ₹246.90 | ₹1,677.68 | **24.05%** | Merchant-safe, **buyer FAIL** (₹230 over ceiling) |
| Candidate A — 3% discount, central                                              | ₹7,990.60 | ₹6,771.69 | ₹450.00 | ₹239.72 | ₹1,481.97 | **21.88%** | **BLOCK** — below 23% floor                       |
| Candidate A′ — minimum viable discount 2.8822%, central                         | ₹8,000.00 | ₹6,779.66 | ₹450.00 | ₹240.00 | ₹1,489.66 | **21.97%** | **BLOCK** — below 23% floor                       |
| Candidate B — reroute to `WH-PNQ-EDGE`, no discount                             | ₹7,980.00 | ₹6,762.71 | ₹60.00  | ₹239.40 | ₹1,863.31 | **27.55%** | **ALLOW**                                         |

**A′ is mandatory.** The rescue planner must search for the *smallest* discount
that satisfies the buyer mandate, report that it searched, and show that even
the minimum still breaches the floor. Do not hardcode a round 3%.

**Sensitivity test.** Re-run all four with gateway-fee GST *not* recoverable
(processor rate 3.54%). Every decision must be unchanged. Assert this.

**Why B is not a disguised discount.** B changes the underlying merchant cost
from ₹450 to ₹60 by changing fulfilment topology. Every merchant-borne cost
stays inside the same formula. Put this sentence in the audit output.

---

## 5. Constraint and evidence semantics

| Type PASS UNKNOWN FAIL  |                             |                                                                                 |                                                             |
| ----------------------- | --------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| HARD                    | eligible on that constraint | `INELIGIBLE_PENDING_EVIDENCE` — no final offer, no payment                      | ineligible unless a permitted intervention changes the fact |
| SOFT                    | may improve ranking         | candidate may remain; the unknown attribute is **never** presented as satisfied | ranking penalty                                             |

**Evidence classes.** Only the first three can satisfy a HARD fact:

- `CURRENT_STATE` — merchant tax config, inventory API within TTL
- `TIME_BOUNDED_CREDENTIAL` — certificate whose validity window contains today
- `CURRENT_POLICY` — effective, not superseded
- `HISTORICAL_EVENT` — **never** satisfies a HARD fact on its own

**Per-predicate rules:**

| Predicate Acceptable current authority Rejected shortcut  |                                                              |                                           |
| --------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------- |
| `GST_INVOICE_AVAILABLE`                                   | `merchant_tax_configuration` with invoice generation enabled | an old invoice implying future capability |
| `FSC_CERTIFIED`                                           | in-scope certificate, validity window contains today         | undated supplier marketing image          |
| `INVENTORY_AT_LOCATION`                                   | inventory source within configured TTL                       | month-old spreadsheet                     |
| `DELIVERY_SLA`                                            | effective current policy or carrier API                      | superseded PDF                            |

The VLM extracts candidate fields and evidence spans. **A deterministic verifier
decides validity** — dates, scope, authority. No model-emitted confidence score
is ever used for gating. Expired or out-of-scope certificate → the HARD
requirement stays unresolved.

In the demo, `GST_INVOICE_AVAILABLE` resolves from merchant tax config
(`VERIFIED_CURRENT`) and `FSC_CERTIFIED` is the one document-unblocking example.

---

## 6. Inventory — atomic, per location

A read followed later by order creation is not sufficient. Reserve at
policy-pass, before Razorpay order creation:

```sql
UPDATE inventory_location
SET reserved_qty = reserved_qty + :qty
WHERE sku = :sku
  AND location_id = :location_id
  AND on_hand_qty - reserved_qty >= :qty
RETURNING location_id, reserved_qty;

```

Require **exactly one** returned row; otherwise the candidate fails and must be
re-planned. Reservation stores `offer_id, location_id, qty, expires_at, status`.
Payment success commits it; abandonment releases on TTL; a payment arriving
after expiry goes to `PAID_REQUIRES_RECONCILIATION` and never silently fulfils.

---

## 7. Razorpay path

**Synchronous, for the demo:**

1. Client returns `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`.
2. Server verifies the Checkout signature using the **server-stored** order id and key secret.
3. Server **fetches** the Payment/Order from Razorpay.
4. Verify server-stored order id, expected amount, currency, and captured/paid state.
5. Only then show confirmation and permit fulfilment.

**Webhook, as durable backstop:**

- Read the **raw request body** before any JSON parsing.
- Verify `X-Razorpay-Signature` (HMAC-SHA256, webhook secret) — this is a *different* secret and mechanism from the Checkout signature.
- Dedupe on `x-razorpay-event-id`; delivery is at-least-once and ordering is not guaranteed.
- Persist and **return 2xx within 5 seconds**; do reconciliation asynchronously. A non-2xx or a slow response causes redelivery.
- Handle `payment.captured`, `payment.failed`, `order.paid`.

**Idempotency.** Do not rely on an Orders API idempotency header. Keep a unique
`commerce_order_id` in your own DB; a retry for the same accepted offer returns
the already-created Razorpay order.

**Policy decision binding.** `policy_decision_id` binds to: offer hash, exact
line items and quantities, gross amount, currency, fulfilment location,
`reservation_id`, tax snapshot, fee policy version, `expires_at`. Change one
rupee and the old decision cannot authorize it.

Also record **realised** processor fee and **realised** contribution after
capture, alongside the expected figures. The audit shows both — expected margin
at authorisation, realised margin after payment. This demonstrates the 3%
reserve was conservative rather than arbitrary.

---

## 8. Build order — hard gates

### P0 — nothing novel until every item passes

1. Config, merchant/product/tax/location schema, verified demo data.
2. **Tax + contribution engine, with §4 golden tests written first.**
3. Intent schema; deterministic HARD/SOFT constraint engine.
4. Offer formation, policy decision binding, discount cap state machine.
5. Atomic per-location reservation with TTL release.
6. Razorpay Test Mode: server-created order → Checkout → signature verification → server status fetch.
7. Signed webhook endpoint: raw-body verification, event-id dedup, fast 2xx.
8. Audit timeline. **Plus one genuine graceful failure — see below.**

> **Gate: all four §4 vectors and the sensitivity variant pass, and one real
> Razorpay test payment completes end to end. Do not proceed otherwise.**

**On the failure demo:** Candidate A being blocked is the policy *working*, not
a failure. Implement a real one — the reservation race is best: two concurrent
intents contend for the 24 units at `WH-PNQ-EDGE`, one wins the atomic
reservation, the other re-plans onto the central route or requests approval.
It exercises §6 and is visibly a failure being absorbed.

### P1 — the differentiator

1. Funnel instrumentation from `AGENT_QUERY_RECEIVED` onward, with reason provenance.
2. Canonical rejection reason codes; disjoint lifecycle buckets (`DIRECTLY_CONVERTED`, `REJECTED_UNRECOVERED`, `RECOVERED_NOT_PAID`, `RECOVERED_AND_PAID`). One intent is one opportunity even across several SKUs — never sum represented GMV per SKU.
3. Merchant Truth with the FSC certificate as the single hard-unblocking case.
4. Rescue planner: central route, local route, **minimum viable discount**, alternate SKU, request approval. Rules rank; an LLM may propose but never authorizes.
5. Isolated paired replay (§9).

### P2 — only if P1 is polished

1. Stateful portfolio replay with location inventory and capacity.
2. Counterfactual policy simulation ranked by net incremental contribution.
3. Observed multi-fix combination analysis.

### Optional, high value if P0+P1 are done

Expose catalog / evaluate / offer as an **MCP server**, and demo a real external
agent querying the merchant. This is the only genuinely novel AI surface in the
project and it is what proves the observability claim — a funnel observing an
agent you did not write. Cut it without hesitation if P0 is not solid.

---

## 9. Evaluation

**Two buyer implementations. Name them separately; do not conflate them.**

- **Demo buyer** — an LLM agent, live in the video, one natural-language intent.
- **Evaluation buyer** — a *deterministic* policy simulator over parameterised intents. State explicitly that replay uses a deterministic buyer model so the pairing is valid, and that it models agent behaviour rather than being an LLM.

**Isolated paired replay.** Every intent twice against the same immutable
merchant snapshot and seed. Control = baseline flow. Treatment = same
everything, rescue available only after baseline rejection. Because treatment
strictly *adds* options, `Control ✓ / Treatment ✕` is a **bug**, not a business
outcome. Regressions must be zero; assert it.

Report: *"+N attributable conversions on the same intents, same merchant
snapshot, same seed"* — never two unrelated batch totals.

**Stateful portfolio replay (P2).** Same ordered stream, two cloned merchant
states, independent stock depletion. Here treatment *can* legitimately regress
by reallocating scarce inventory to earlier rescued intents. Log the mechanism;
do not attribute it to nondeterminism.

**Counterfactuals.** Replay against the same intent stream. Rank by net
incremental contribution, not gross GMV. If buyer substitution is not modelled,
label it `UNMODELLED`. Never invent a cannibalisation line.

Label every simulation result as **simulation estimate, not causal proof**.

---

## 10. Things you must not do

- Do not let an LLM compute money, authorize a discount, or create a payment.
- Do not promote `HISTORICAL_EVENT` evidence to satisfy a HARD constraint.
- Do not use a model-emitted confidence score for gating.
- Do not split a jointly blocked intent's value fractionally across blockers. `single_fix_unlockable_gmv[X] += intent_value` **only if** repairing X alone flips the intent from rejected to eligible. Report joint blockers as observed combinations only; do not enumerate the combinatorial space.
- Do not claim visibility into agents that never queried the merchant.
- Do not report gross GMV as the headline. **Net incremental contribution is the primary metric.** Revenue is trivially increased by giving money away.
- Do not build a twelve-page dashboard. Five screens: Overview, Live Buyer, Shadow Funnel, Opportunities, Audit.
- Do not put real API keys in the repo. Test Mode keys via environment only.