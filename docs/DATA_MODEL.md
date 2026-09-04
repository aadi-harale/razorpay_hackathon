# Data model

RazorProcure uses SQLite locally. All money columns ending in `_paise` are integer minor units; tax and margin rates are decimal strings. Browser and model output never become authoritative payment values.

| Area | Tables | Purpose |
|---|---|---|
| Identity | `merchants`, `auth_users`, `auth_sessions` | One merchant workspace and revocable signed sessions |
| Merchant truth | `merchant_products`, `fulfilment_locations`, `evidence_facts`, `merchant_procurement_policy` | Current product economics, fulfilment costs, evidence and versioned spend control |
| Buyer flow | `buyer_intents`, `offers`, `policy_decisions` | Intent lifecycle and immutable server-side authorization binding |
| Inventory | `inventory_location`, `inventory_reservations` | Per-location stock and guarded ACTIVE → COMMITTED/RELEASED/EXPIRED reservations |
| Procurement memory | `retailer_purchase_lines` | Source-labelled invoice/manual purchase facts and normalized or explicitly unmatched identities |
| Supplier network | `connected_suppliers`, `supplier_listings`, `supplier_reservations` | Verification, GST capability, reliability, live stock and atomic case reservations |
| Procurement plans | `procurement_runs`, `procurement_run_options`, `procurement_orders` | Full comparison snapshots, selected plan and payment state |
| Payment | `commerce_orders`, `processed_webhooks` | Idempotent local order claims and webhook replay protection |
| Evidence | `uploaded_evidence` | File hash, parse state and accepted/rejected evidence status |
| Evaluation | `replay_runs`, `replay_results` | Reproducible control/treatment results and contention effects |
| Audit | `audit_events` | Append-only actor, event, severity, detail and redacted metadata |

Key invariants:

- Policy decisions bind offer hash, exact amount, currency, route, reservation, tax snapshot, fee-policy version and expiry.
- Atomic `UPDATE … WHERE available >= requested` guards inventory. A failed claim cannot create payment authority.
- Unknown invoice identities use an `unmatched-*` key and cannot silently become a catalog match.
- Invoice hashes make repeated imports idempotent.
- Payment success is server-owned. Demo mode creates explicit dummy identifiers; private Test Mode additionally requires signature and provider-state verification.
