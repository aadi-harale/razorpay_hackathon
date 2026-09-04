import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyCheckoutSignature, verifyWebhookSignature } from "@/lib/razorpay";

describe("Razorpay HMAC boundaries", () => {
  it("verifies checkout signature against the server-stored order id", () => {
    process.env.RAZORPAY_KEY_SECRET = "test_key_secret_1234567890";
    const orderId = "order_test_123";
    const paymentId = "pay_test_456";
    const signature = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
    expect(verifyCheckoutSignature({ storedOrderId:orderId, paymentId, signature })).toBe(true);
    expect(verifyCheckoutSignature({ storedOrderId:"order_tampered", paymentId, signature })).toBe(false);
  });
  it("verifies webhook signature over the raw body with a separate secret", () => {
    process.env.RAZORPAY_WEBHOOK_SECRET = "webhook_secret_1234567890";
    const raw = '{"event":"payment.captured","payload":{}}';
    const signature = createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex");
    expect(verifyWebhookSignature(raw, signature)).toBe(true);
    expect(verifyWebhookSignature(`${raw} `, signature)).toBe(false);
  });
});

import { razorpayClient } from "@/lib/razorpay";

describe("Razorpay environment gate", () => {
  it("refuses live-mode keys in the Buildathon application", () => {
    process.env.PAYMENT_MODE = "razorpay_test";
    process.env.RAZORPAY_KEY_ID = "rzp_live_forbidden";
    process.env.RAZORPAY_KEY_SECRET = "secret";
    expect(() => razorpayClient()).toThrow("RAZORPAY_TEST_MODE_REQUIRED");
    delete process.env.PAYMENT_MODE;
  });
  it("does not contact an external gateway in default demo mode", () => {
    delete process.env.PAYMENT_MODE;
    process.env.RAZORPAY_KEY_ID = "rzp_test_present_but_ignored";
    process.env.RAZORPAY_KEY_SECRET = "secret";
    expect(() => razorpayClient()).toThrow("EXTERNAL_PAYMENT_DISABLED");
  });
});
