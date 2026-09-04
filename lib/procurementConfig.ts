export const PROCUREMENT = {
  workspaceName: "Aster Retail",
  currency: "INR",
  autonomousSpendLimitPaise: 1_500_000,
  defaultBudgetPaise: 900_000,
  defaultDeadlineDays: 2,
  demoProductKey: "fortune-sunflower-oil-1l-case48",
  demoProductName: "Fortune Sunflower Oil 1L · Case of 48",
  demoBrand: "Fortune",
  demoPack: "1L × 48",
  demoCases: 1,
  inputGstRecoverable: true,
  shippingGstRate: "0.18",
  requiresGstInvoiceByDefault: true,
  planTtlSeconds: 600,
  products: [
    { key:"fortune-sunflower-oil-1l-case48", name:"Fortune Sunflower Oil 1L · Case of 48", brand:"Fortune", pack:"1L × 48", gstRate:"0.05" },
    { key:"maggi-masala-70g-case96", name:"Maggi Masala Noodles 70g · Case of 96", brand:"Maggi", pack:"70g × 96", gstRate:"0.12" },
    { key:"surf-excel-matic-1kg-case24", name:"Surf Excel Matic 1kg · Case of 24", brand:"Surf Excel", pack:"1kg × 24", gstRate:"0.18" }
  ],
  suppliers: [
    { id:"SUP-ABC", name:"ABC Wholesale", verification:"VERIFIED", gstInvoice:true, reliability:94, etaDays:1, role:"USUAL" },
    { id:"SUP-PNQ", name:"Pune Wholesale Hub", verification:"VERIFIED", gstInvoice:true, reliability:97, etaDays:1, role:"CONNECTED" },
    { id:"SUP-METRO", name:"MetroTrade Supplies", verification:"VERIFIED", gstInvoice:true, reliability:95, etaDays:2, role:"CONNECTED" },
    { id:"SUP-SHREE", name:"Shree Distributors", verification:"VERIFIED", gstInvoice:true, reliability:92, etaDays:1, role:"CONNECTED" }
  ],
  listings: [
    { supplierId:"SUP-ABC", productKey:"fortune-sunflower-oil-1l-case48", title:"Fortune Sunflower Oil 1L x 48", casePricePaise:820_000, shippingPaise:15_000, availableCases:18, minCases:1 },
    { supplierId:"SUP-PNQ", productKey:"fortune-sunflower-oil-1l-case48", title:"Fortune Sunflower Oil 1 litre carton (48 pcs)", casePricePaise:760_000, shippingPaise:12_000, availableCases:12, minCases:1 },
    { supplierId:"SUP-METRO", productKey:"fortune-sunflower-oil-1l-case48", title:"Fortune Sunflower Refined Oil 1L · 48 pack", casePricePaise:742_000, shippingPaise:48_000, availableCases:25, minCases:1 },
    { supplierId:"SUP-SHREE", productKey:"fortune-sunflower-oil-1l-case48", title:"Fortune Oil 1L Case48", casePricePaise:775_000, shippingPaise:0, availableCases:9, minCases:1 },

    { supplierId:"SUP-ABC", productKey:"maggi-masala-70g-case96", title:"Maggi Masala 70g x 96", casePricePaise:1_185_000, shippingPaise:18_000, availableCases:14, minCases:1 },
    { supplierId:"SUP-PNQ", productKey:"maggi-masala-70g-case96", title:"Nestle Maggi Masala Noodles 70g · 96", casePricePaise:1_128_000, shippingPaise:14_000, availableCases:10, minCases:1 },
    { supplierId:"SUP-METRO", productKey:"maggi-masala-70g-case96", title:"Maggi 2 Minute Masala 70g wholesale case", casePricePaise:1_104_000, shippingPaise:42_000, availableCases:20, minCases:1 },

    { supplierId:"SUP-ABC", productKey:"surf-excel-matic-1kg-case24", title:"Surf Excel Matic 1kg x 24", casePricePaise:2_520_000, shippingPaise:24_000, availableCases:8, minCases:1 },
    { supplierId:"SUP-PNQ", productKey:"surf-excel-matic-1kg-case24", title:"Surf Excel Matic 1kg · Case24", casePricePaise:2_410_000, shippingPaise:20_000, availableCases:7, minCases:1 },
    { supplierId:"SUP-SHREE", productKey:"surf-excel-matic-1kg-case24", title:"Surf Excel Matic 1 KG carton 24", casePricePaise:2_395_000, shippingPaise:36_000, availableCases:6, minCases:1 }
  ]
} as const;
