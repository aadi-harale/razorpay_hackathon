import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUNDLED_DEMO_INVOICE_SHA256, bundledDemoInvoice } from "@/lib/demoInvoice";

describe("bundled invoice demo", () => {
  it("keeps the deterministic fixture bound to the exact bundled image", () => {
    const bytes = readFileSync(resolve(process.cwd(), "public", "demo", "sample-invoice.png"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(BUNDLED_DEMO_INVOICE_SHA256);
  });

  it("matches every visible invoice line and total", () => {
    const invoice = bundledDemoInvoice();
    expect(invoice.supplierName).toBe("ABC Wholesale");
    expect(invoice.invoiceDate).toBe("2026-09-04");
    expect(invoice.items).toHaveLength(3);
    expect(invoice.items.reduce((sum, item) => sum + Number(item.grossLineAmount), 0)).toBe(45_220);
  });
});
