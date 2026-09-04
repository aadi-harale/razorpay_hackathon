# API Surface

## Merchant browser APIs

All require the authenticated HttpOnly merchant session unless noted.

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/auth/login` | demo merchant authentication + throttling |
| POST | `/api/auth/logout` | destroy current session |
| GET | `/api/dashboard` | persisted/computed funnel, inventory, replay/opportunity status |
| POST | `/api/demo/run` | execute flagship deterministic decision flow |
| POST | `/api/demo/race` | atomic scarce-inventory failure demo |
| POST | `/api/demo/reset` | explicit demo reset |
| POST | `/api/evidence/upload` | validated Merchant Truth evidence ingestion |
| POST | `/api/checkout/start` | revalidate bound offer and create/reuse Razorpay Order |
| POST | `/api/checkout/verify` | verify Checkout HMAC + fetch/verify payment/order state |
| GET | `/api/audit` | audit events |
| POST | `/api/replay/run` | persist isolated/stateful replay |
| GET | `/api/replay/latest` | latest replay + opportunities |
| GET | `/api/health` | local launcher health check |

`POST /api/webhooks/razorpay` is not session-authenticated; it authenticates the **raw body** with the Razorpay webhook HMAC and deduplicates `x-razorpay-event-id`.

No checkout endpoint accepts a client-authoritative amount.

## External AI-buyer surface

Requires:

```text
Authorization: Bearer <AGENT_API_TOKEN>
```

| Method | Route | Authority |
|---|---|---|
| GET | `/api/agent/catalog` | machine-readable catalog/evidence/inventory discovery |
| POST | `/api/agent/evaluate` | deterministic buyer/merchant compatibility evaluation |
| POST | `/api/agent/offer` | **non-binding** offer preview; cannot reserve/pay |

Example evaluation body:

```json
{
  "quantity": 20,
  "budgetMaxPaise": 800000,
  "destination": "Pune",
  "hardRequirements": ["GST_INVOICE", "FSC_CERTIFIED"]
}
```

Payment authority remains: persisted offer → deterministic `PolicyDecision` → atomic reservation → authenticated merchant checkout route → Razorpay.
