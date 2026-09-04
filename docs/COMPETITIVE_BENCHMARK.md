# Competitive benchmark

RazorProcure was benchmarked in September 2026 against official product material from five representative category leaders. This is a product-capability benchmark, not an unsupported ranking or a claim of feature-for-feature enterprise parity.

| Benchmark | Standout implementation | Separate RazorProcure capability |
|---|---|---|
| [Zip](https://ziphq.com/products/risk-orchestration) | Unified intake plus cross-functional supplier-risk orchestration | **ShadowFunnel:** one deterministic view of policy, evidence, stock and payment authority |
| [Ramp Procurement](https://docs.ramp.com/developer-api/v1/procurement) | Program-based intake, approvals and PO creation with an integration surface | **Policy-bound execution:** configurable autonomous limit, server-created order and agent-safe API |
| [Procurify](https://www.procurify.com/procure-to-pay/procurement/ai/) | Plain-language intake, policy guidance and automated three-way matching | **Smart Buy + Delivery Shield:** natural-language request, transparent economics and signed receiving authority |
| [Order.co](https://www.order.co/ai/) | Catalog learning, supplier sourcing, order tracking and line-level reconciliation | **Connected sourcing:** supplier comparison, full-basket allocation, purchase memory and discrepancy value |
| [RELEX](https://www.relexsolutions.com/relex-forecasting-and-replenishment-rfp/) | Retail demand forecasting, replenishment scenarios and exception-based planning | **Purchase memory + replay:** reorder opportunities, paired outcomes and deterministic scenario analysis |

## Novel compound layer: Procurement Twin

The benchmarked products demonstrate these controls at different points in the lifecycle. RazorProcure now compounds them before payment: the selected plan is stress-tested against a 7% price shock, supplier outage, two-day delivery slip and doubled demand. The engine computes a resilience score, separates autonomous outcomes from approval-required and blocked outcomes, quantifies avoidable downside and pre-clears the most useful fallback supplier without mutating the live order.

This is intentionally deterministic. The model can explain the result, but the scenario costs, hard gates, authority envelope and fallback ranking are all server-owned and unit-tested.

## Focused differentiators

- **Explainable economics:** every option exposes unit price, GST, delivery fee, gross payable and savings instead of returning a black-box rank.
- **Hard authority boundary:** language models may interpret requests and invoices, but only server-owned arithmetic, policy, current evidence and inventory can authorize a purchase.
- **Exception value, not just exception status:** receiving computes the fair value of what arrived and displays the spend held back from a mismatched invoice.
- **Counterfactual before commitment:** Procurement Twin proves how the plan behaves under four disruptions before the merchant pays.
- **Reproducible failure proof:** the inventory race and paired replay let a reviewer reproduce both safety and commercial outcomes.
- **Account-free public demo:** dummy payments exercise the complete state machine without connecting a real Razorpay account or loading provider Checkout.

## Honest scope boundary

The current release is a single-merchant hackathon product with seeded connected suppliers and durable single-workspace Supabase snapshot persistence. Enterprise suites offer broader ERP integrations, supplier networks, international tax coverage, row-native multi-tenant storage and mature administration. Those are production roadmap items, not claims made by this demo.
