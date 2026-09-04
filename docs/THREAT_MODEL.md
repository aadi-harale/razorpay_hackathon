# Threat Model

| Threat | Control |
|---|---|
| Buyer manipulates payment amount in browser | Server accepts `offerId` only and loads exact bound amount |
| Reuse policy approval for a different offer | SHA-256 offer hash + exact amount/route/reservation binding |
| Double-click creates duplicate Razorpay orders | Unique local `commerce_orders.offer_id`; retry returns existing order |
| Fake Checkout callback | Server HMAC verification + Razorpay state fetch |
| Fake webhook | Raw-body HMAC verification with separate webhook secret |
| Duplicate webhook | Unique `x-razorpay-event-id` |
| Stale/expired offer | Server expiry check before order creation |
| Stock oversell | Atomic guarded update at SKU + location |
| Late payment after stock reservation expiry | Payment accepted financially but fulfilment enters `PAID_REQUIRES_RECONCILIATION` |
| Historical invoice falsely proves current GST capability | Historical evidence cannot satisfy HARD current capability |
| Expired FSC certificate | Deterministic validity-window check keeps requirement unresolved |
| Model prompt injection in merchant content | Model outputs, if added, are candidates only; authority layer is deterministic |
| API key exposure | Key secret/webhook secret server environment only; never rendered/logged |
| Cross-site mutation | SameSite=Strict session + explicit Origin check |
| Session token theft from JS | HttpOnly cookie |
| Multi-tenant object swapping | Server session merchant id scopes state queries |

## Production delta

For Internet-facing production, use managed PostgreSQL, rate limiting, centralized secrets, a durable queue for webhook reconciliation, CSP nonces instead of `unsafe-inline`, formal RBAC/2FA, structured security logging, upload malware scanning and independent penetration testing.
