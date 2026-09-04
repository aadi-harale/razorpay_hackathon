# Razorpay Test-Mode Setup

1. Create Razorpay Test Mode API keys.
2. Put `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in `.env.local`.
3. Create a webhook secret and put it in `RAZORPAY_WEBHOOK_SECRET`.
4. If using a tunnel/deployment, set `APP_ORIGIN` to the exact public origin.
5. Configure webhook URL:

   `https://YOUR_PUBLIC_HOST/api/webhooks/razorpay`

6. Subscribe at minimum to `payment.captured`, `payment.failed`, and `order.paid`.
7. Restart the server after editing environment variables.

## Payment authority

The frontend sends only `offerId` to `/api/checkout/start`. The server retrieves the exact amount, currency, policy decision, inventory reservation, expiry and offer hash. Browser-supplied amounts are ignored because they are not accepted by the route schema.

After Checkout returns, `/api/checkout/verify`:

- verifies the Checkout HMAC using the server-stored Razorpay order id,
- fetches Payment and Order from Razorpay,
- checks exact amount, currency and order relationship,
- requires captured/paid state,
- commits inventory only when the reservation is still valid.

The signed webhook is a durable backstop and is independently HMAC-verified from the raw request body.
