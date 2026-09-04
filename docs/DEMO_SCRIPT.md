# Five-Minute Demo Script

## 0:00–0:25 — Problem

“AI buyers can query a merchant, decide the offer is incompatible, and leave without ever entering a normal web cart. ShadowFunnel instruments that machine-side funnel and lets the merchant form a better offer only when the economics and evidence remain safe.”

Open **Home**. Point to potential savings, reorders approaching and better sourcing plans.

## 0:25–2:45 — Flagship live buyer

Open **Smart Buy** → **Run full demo**.

1. Buyer requests 20 FSC-certified gift boxes, final payable ≤ ₹8,000, Pune delivery Monday, GST invoice required.
2. Show GST invoice capability is current merchant configuration — not inferred from an old invoice.
3. Show FSC initially unresolved, then verified from a currently valid in-scope certificate.
4. Baseline central route is merchant-safe but buyer fails budget.
5. Planner searches the minimum viable discount first. It reaches the buyer ceiling but breaches 23% contribution margin → BLOCK.
6. 3% discount also blocks.
7. Pune edge fulfilment changes real underlying fulfilment cost rather than relabelling a discount. It passes buyer budget and 23% margin floor.
8. Inventory is reserved at the exact Pune location.
9. Click **Simulate payment**. The account-free demo creates dummy identifiers without contacting a payment provider.
10. Point out the optional private Razorpay Test adapter separately verifies signature **and** provider payment/order state before fulfilment.

## 2:45–3:25 — Failure

Click **Reset** → **Inventory race**.

Two 20-unit reservation attempts contend for 24 units. Exactly one atomic reservation succeeds. The second is replanned to central stock, but the higher payable needs explicit approval and no payment is created.

## 3:25–4:10 — Shadow Funnel

Stay in **Smart Buy** and inspect the trace and safety kernel.

Say the claim boundary exactly:

> “We observe agents that queried our merchant surface and did not convert. Agents that eliminated the merchant before querying are not observable and we do not claim they are.”

Show observed/inferred/unknown provenance.

## 4:10–4:45 — Opportunities

Open **Savings Insights**.

Explain paired replay: identical buyer intents, identical merchant snapshot, rescue disabled in control and enabled only after rejection in treatment. Headline is **net incremental contribution**, not gross revenue.

## 4:45–5:00 — Audit / close

Open **Audit**.

“Every money-affecting decision is deterministic, bound to exact offer state and auditable. LLMs may understand language; they never control arithmetic, inventory, evidence validity or payment.”
