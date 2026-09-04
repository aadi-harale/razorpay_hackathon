# Security model

RazorProcure treats browser input, supplier data, uploaded documents, model output, Razorpay callbacks, and webhooks as untrusted until validated.

## Local single-user authentication

The Windows demo build intentionally exposes exactly one local retailer identity, defaulting to `merchant@razorprocure.local`. Its password and server secrets are generated securely on first launch and remain stable across restarts. `reset-login.bat` explicitly rotates the password and clears only sessions/login lockouts. Vercel/production deployments must set their own `DEMO_EMAIL`, strong `DEMO_PASSWORD`, and `SESSION_SECRET` in the deployment environment. No second local user is supported.


## Money authority
All money uses deterministic fixed-decimal/integer-paise logic. The client cannot set Razorpay amount, contribution, tax, supplier price, or policy result.

## Payment integrity
Orders are created server-side. Checkout signatures are verified with the server-stored Razorpay order ID. Payment/order status is fetched from Razorpay and exact amount, currency, relation, and captured/paid state are checked before inventory is committed. Webhooks verify HMAC over the raw body and dedupe event IDs.

## Inventory
Reservations use atomic conditional updates. Expired reservations release inventory. Late/ambiguous payment states require reconciliation rather than silent fulfilment.

## LLM boundary
OpenRouter is an extraction layer only. It cannot authorize prices, savings, GST authority, policy, inventory, or payment. Its output is schema validated.

## Authentication
Local bootstrap generates a strong retailer password, session secret, and agent token. Mutation routes enforce same-origin protection. Cookies are HttpOnly/SameSite and become Secure on HTTPS production origins.

## Secrets
Never commit `.env.local`. `configure.bat` writes secrets locally. Vercel secrets must be entered in Vercel Environment Variables. `npm run secret-scan` checks the release tree for common credential patterns.

## Vercel caveat
The included Vercel DB fallback is ephemeral demo storage. It is not a substitute for durable transactional storage in a multi-user production deployment.
