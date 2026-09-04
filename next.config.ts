import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const externalPaymentsEnabled = process.env.PAYMENT_MODE === "razorpay_test";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}${externalPaymentsEnabled ? " https://checkout.razorpay.com https://*.razorpay.com" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self'${externalPaymentsEnabled ? " https://*.razorpay.com" : ""}`,
  `frame-src${externalPaymentsEnabled ? " https://*.razorpay.com" : " 'none'"}`,
  "object-src 'none'",
  "base-uri 'self'",
  `form-action 'self'${externalPaymentsEnabled ? " https://*.razorpay.com" : ""}`,
  "frame-ancestors 'none'"
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  serverExternalPackages: ["better-sqlite3", "razorpay"],
  async headers() {
    const headers = [
      { key: "Content-Security-Policy", value: csp },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), usb=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" }
    ];
    if (isProd) {
      headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" });
    }
    return [{ source: "/(.*)", headers }];
  }
};

export default nextConfig;
