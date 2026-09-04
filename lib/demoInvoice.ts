import type { ExtractedInvoice } from "@/lib/openrouter";

// SHA-256 of public/demo/sample-invoice.png. Only this exact bundled asset may
// use the deterministic fixture; user uploads always go through the configured
// extraction provider.
export const BUNDLED_DEMO_INVOICE_SHA256 = "dc0b708d17254d452da2a81a9dea95351c52f63d227edfccc4b0b4befc07ced7";

export function bundledDemoInvoice(): ExtractedInvoice {
  return {
    supplierName: "ABC Wholesale",
    invoiceDate: "2026-09-04",
    currency: "INR",
    items: [
      { productName: "Fortune Sunflower Oil 1L", brand: "Fortune", pack: "1L x 48", quantity: 48, grossLineAmount: "8120.00", gstRatePercent: "0" },
      { productName: "Maggi Masala Noodles 70g", brand: "Maggi", pack: "70g x 96", quantity: 96, grossLineAmount: "11900.00", gstRatePercent: "0" },
      { productName: "Surf Excel Matic 1kg", brand: "Surf Excel", pack: "1kg x 24", quantity: 24, grossLineAmount: "25200.00", gstRatePercent: "0" },
    ],
  };
}
