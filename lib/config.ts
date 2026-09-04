export const DEMO = {
  merchantId: "m_demo",
  merchantName: "Aster & Co. Corporate Gifting",
  productName: "Eco Corporate Gift Box",
  gstin: "27AABCA1234F1Z5",
  sku: "BX-104",
  unitGrossPaise: 39_900,
  quantity: 20,
  buyerBudgetGrossPaise: 800_000,
  supplierGrossCostPaise: 542_800,
  economicCogsPaise: 460_000,
  unitEconomicCogsPaise: 23_000,
  costSource: "supplier_purchase_invoice_demo_2026-09",
  outputGstRate: "0.18",
  gatewayPlatformRate: "0.03",
  gatewayFeeGstRate: "0.18",
  contributionFloor: "0.23",
  autonomousDiscountCapBps: 400,
  approvalDiscountCapBps: 500,
  currency: "INR",
  reservationTtlSeconds: 600,
  locations: {
    central: {
      id: "WH-MUM-CENTRAL",
      label: "Mumbai Central",
      stock: 47,
      fulfilmentCostPaise: 45_000,
      buyerShippingChargePaise: 25_000
    },
    edge: {
      id: "WH-PNQ-EDGE",
      label: "Pune Edge",
      stock: 24,
      fulfilmentCostPaise: 6_000,
      buyerShippingChargePaise: 0
    }
  },
  fscCertificate: {
    source: "FSC_Certificate_2026.pdf",
    validFrom: "2026-04-01",
    validUntil: "2027-03-31",
    scope: "BX-series packaging"
  }
} as const;

export const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:3000";
export const DEMO_EMAIL = process.env.DEMO_EMAIL || "merchant@razorprocure.local";
const demoPasswordEnv = process.env.DEMO_PASSWORD;
if (process.env.NODE_ENV === "production" && (!demoPasswordEnv || demoPasswordEnv.length < 16 || demoPasswordEnv.includes("replace-with"))) {
  throw new Error("DEMO_PASSWORD_REQUIRED_IN_PRODUCTION");
}
export const DEMO_PASSWORD = demoPasswordEnv || "dev-only-password-change-me";
const sessionSecretEnv = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === "production" && (!sessionSecretEnv || sessionSecretEnv.length < 32 || sessionSecretEnv.includes("replace-with"))) {
  throw new Error("SESSION_SECRET_REQUIRED_IN_PRODUCTION");
}
export const SESSION_SECRET = sessionSecretEnv || "dev-only-insecure-session-secret-change-me-now";

export function gatewayFeeGstRecoverable() {
  return (process.env.DEMO_GATEWAY_GST_RECOVERABLE ?? "true").toLowerCase() === "true";
}

export function razorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID?.startsWith("rzp_test_") && process.env.RAZORPAY_KEY_SECRET);
}
