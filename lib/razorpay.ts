import Razorpay from "razorpay";
import { createHmac, timingSafeEqual } from "node:crypto";
import { paymentMode } from "@/lib/config";

export function razorpayClient() {
  if (paymentMode() !== "razorpay_test") throw new Error("EXTERNAL_PAYMENT_DISABLED");
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("RAZORPAY_NOT_CONFIGURED");
  if (!keyId.startsWith("rzp_test_")) throw new Error("RAZORPAY_TEST_MODE_REQUIRED");
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export function verifyCheckoutSignature(input: { storedOrderId: string; paymentId: string; signature: string }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error("RAZORPAY_NOT_CONFIGURED");
  const expected = createHmac("sha256", secret).update(`${input.storedOrderId}|${input.paymentId}`).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(input.signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new Error("RAZORPAY_WEBHOOK_SECRET_NOT_CONFIGURED");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
