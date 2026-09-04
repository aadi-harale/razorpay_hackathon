# Competitive benchmark

RazorProcure was benchmarked against official product material from established procure-to-pay, restaurant procurement and retail planning platforms. The goal is not to claim feature-for-feature parity with enterprise suites; it is to combine their strongest workflow patterns into a focused, inspectable retailer demo.

| Product pattern | Official examples | What RazorProcure implements |
|---|---|---|
| Guided intake, approvals and purchase orders | [Procurify](https://www.procurify.com/platform/features/), [Zip](https://ziphq.com/), [Ramp Procurement](https://support.ramp.com/hc/en-us/articles/49355243914387-Ramp-Procurement-Quick-Start-Guide) | Natural-language Smart Buy, explainable supplier plan, configurable autonomous-spend gate and server-bound order authorization |
| Invoice matching and AP controls | [Order.co](https://www.order.co/accounts-payable-software/), [Precoro](https://precoro.com/product-tour) | Deterministic PO/receipt/invoice reconciliation, automatic exception hold and quantified protected value |
| Restaurant and multi-location purchasing | [BlueCart](https://www.bluecart.com/restaurant-procurement-software), [MarketMan](https://www.marketman.com/), [Supy](https://supy.io/platform/restaurant-procurement-software) | Connected supplier catalog, landed-cost comparison, case-level stock, basket allocation, receiving variance alerts and purchase memory |
| Retail forecasting and replenishment | [RELEX](https://www.relexsolutions.com/) | Repeat-purchase memory, reorder opportunity ranking and deterministic paired replay for the demo dataset |

## Focused differentiators

- **Explainable economics:** every option exposes unit price, GST, delivery fee, gross payable and savings instead of returning a black-box rank.
- **Hard authority boundary:** language models may interpret requests and invoices, but only server-owned arithmetic, policy, current evidence and inventory can authorize a purchase.
- **Exception value, not just exception status:** receiving computes the fair value of what arrived and displays the spend held back from a mismatched invoice.
- **Reproducible failure proof:** the inventory race and paired replay let a reviewer reproduce both safety and commercial outcomes.
- **Account-free public demo:** dummy payments exercise the complete state machine without connecting a real Razorpay account or loading provider Checkout.

## Honest scope boundary

The current release is a single-merchant hackathon product with seeded connected suppliers and an ephemeral Vercel database. Enterprise suites offer broader ERP integrations, supplier networks, international tax coverage and mature multi-tenant administration. Those are production roadmap items, not claims made by this demo.
