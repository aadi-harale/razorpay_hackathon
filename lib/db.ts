import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DEMO } from "@/lib/config";
import { PROCUREMENT } from "@/lib/procurementConfig";

const isVercel = process.env.VERCEL === "1";
const configuredDb = process.env.DATABASE_URL?.startsWith("file:") ? process.env.DATABASE_URL.slice(5) : ".data/razorprocure.db";
// Vercel's deployment bundle is read-only. /tmp is writable but ephemeral; use this
// only for the hosted demo. Local mode keeps durable SQLite under the project.
const dbPath = isVercel
  ? "/tmp/razorprocure.db"
  : resolve(/* turbopackIgnore: true */ process.cwd(), configuredDb);
mkdirSync(dirname(dbPath), { recursive: true });

const globalForDb = globalThis as unknown as { shadowDb?: Database.Database };
export const db = globalForDb.shadowDb ?? new Database(dbPath);
if (process.env.NODE_ENV !== "production") globalForDb.shadowDb = db;

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.pragma("synchronous = NORMAL");

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS merchants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS merchant_tax_configs (
      merchant_id TEXT PRIMARY KEY,
      gst_registered INTEGER NOT NULL CHECK(gst_registered IN (0,1)),
      gstin TEXT,
      invoice_generation_enabled INTEGER NOT NULL CHECK(invoice_generation_enabled IN (0,1)),
      input_gst_recoverable INTEGER NOT NULL CHECK(input_gst_recoverable IN (0,1)),
      gateway_gst_recoverable INTEGER NOT NULL CHECK(gateway_gst_recoverable IN (0,1)),
      updated_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      merchant_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      name TEXT NOT NULL,
      gross_unit_price_paise INTEGER NOT NULL CHECK(gross_unit_price_paise > 0),
      output_gst_rate TEXT NOT NULL,
      economic_unit_cogs_paise INTEGER NOT NULL CHECK(economic_unit_cogs_paise >= 0),
      cost_status TEXT NOT NULL CHECK(cost_status IN ('VERIFIED_CURRENT','STALE','CONFLICTING','MISSING')),
      cost_source TEXT NOT NULL,
      cost_updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (merchant_id, sku),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS fulfilment_locations (
      merchant_id TEXT NOT NULL,
      id TEXT NOT NULL,
      label TEXT NOT NULL,
      economic_fulfilment_cost_paise INTEGER NOT NULL CHECK(economic_fulfilment_cost_paise >= 0),
      buyer_shipping_charge_paise INTEGER NOT NULL CHECK(buyer_shipping_charge_paise >= 0),
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (merchant_id, id),
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS login_attempts (
      key TEXT PRIMARY KEY,
      failures INTEGER NOT NULL DEFAULT 0,
      first_failure_at TEXT NOT NULL,
      blocked_until TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory_location (
      merchant_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      location_id TEXT NOT NULL,
      on_hand_qty INTEGER NOT NULL CHECK(on_hand_qty >= 0),
      reserved_qty INTEGER NOT NULL DEFAULT 0 CHECK(reserved_qty >= 0),
      updated_at TEXT NOT NULL,
      PRIMARY KEY (merchant_id, sku, location_id),
      CHECK(reserved_qty <= on_hand_qty),
      FOREIGN KEY (merchant_id, sku) REFERENCES products(merchant_id, sku),
      FOREIGN KEY (merchant_id, location_id) REFERENCES fulfilment_locations(merchant_id, id)
    );

    CREATE TABLE IF NOT EXISTS inventory_reservations (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      location_id TEXT NOT NULL,
      qty INTEGER NOT NULL CHECK(qty > 0),
      offer_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ACTIVE','COMMITTED','RELEASED','EXPIRED','RECONCILIATION_REQUIRED')),
      created_at TEXT NOT NULL,
      UNIQUE(offer_id),
      FOREIGN KEY (merchant_id, sku, location_id) REFERENCES inventory_location(merchant_id, sku, location_id)
    );

    CREATE TABLE IF NOT EXISTS buyer_intents (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      state TEXT NOT NULL,
      lifecycle TEXT NOT NULL CHECK(lifecycle IN ('DIRECTLY_CONVERTED','REJECTED_UNRECOVERED','RECOVERED_NOT_PAID','RECOVERED_AND_PAID')),
      represented_gmv_paise INTEGER NOT NULL CHECK(represented_gmv_paise >= 0),
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS evidence_sources (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
      sha256 TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('STORED','REJECTED','PARSED')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS evidence_facts (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      source_id TEXT,
      predicate TEXT NOT NULL,
      status TEXT NOT NULL,
      evidence_class TEXT NOT NULL,
      source TEXT NOT NULL,
      detail TEXT NOT NULL,
      evidence_span TEXT,
      verifier TEXT,
      valid_from TEXT,
      valid_until TEXT,
      scope TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (source_id) REFERENCES evidence_sources(id)
    );

    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      intent_id TEXT NOT NULL,
      sku TEXT NOT NULL,
      qty INTEGER NOT NULL CHECK(qty > 0),
      location_id TEXT NOT NULL,
      gross_amount_paise INTEGER NOT NULL CHECK(gross_amount_paise > 0),
      currency TEXT NOT NULL,
      contribution_margin TEXT NOT NULL,
      offer_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('APPROVED','CHECKOUT_STARTED','PAID','EXPIRED','CANCELLED')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (intent_id) REFERENCES buyer_intents(id)
    );

    CREATE TABLE IF NOT EXISTS policy_decisions (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      offer_id TEXT NOT NULL UNIQUE,
      offer_hash TEXT NOT NULL,
      reservation_id TEXT NOT NULL,
      exact_amount_paise INTEGER NOT NULL CHECK(exact_amount_paise > 0),
      currency TEXT NOT NULL,
      fulfilment_location TEXT NOT NULL,
      contribution_margin TEXT NOT NULL,
      margin_floor TEXT NOT NULL,
      tax_snapshot TEXT NOT NULL,
      fee_policy_version TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      result TEXT NOT NULL CHECK(result IN ('ALLOW','BLOCK','APPROVAL_REQUIRED')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (offer_id) REFERENCES offers(id),
      FOREIGN KEY (reservation_id) REFERENCES inventory_reservations(id)
    );

    CREATE TABLE IF NOT EXISTS commerce_orders (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      offer_id TEXT NOT NULL UNIQUE,
      razorpay_order_id TEXT UNIQUE,
      razorpay_payment_id TEXT,
      expected_amount_paise INTEGER NOT NULL CHECK(expected_amount_paise > 0),
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      last_error TEXT,
      realized_processor_fee_paise INTEGER,
      realized_contribution_paise INTEGER,
      realized_contribution_margin TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (offer_id) REFERENCES offers(id)
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      intent_id TEXT,
      offer_id TEXT,
      event_type TEXT NOT NULL,
      actor TEXT NOT NULL,
      severity TEXT NOT NULL,
      detail TEXT NOT NULL,
      metadata TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS replay_runs (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      mode TEXT NOT NULL CHECK(mode IN ('ISOLATED','STATEFUL')),
      seed INTEGER NOT NULL,
      intents INTEGER NOT NULL CHECK(intents > 0),
      control_paid INTEGER NOT NULL,
      treatment_paid INTEGER NOT NULL,
      regressions INTEGER NOT NULL,
      control_contribution_paise INTEGER NOT NULL,
      treatment_contribution_paise INTEGER NOT NULL,
      incremental_contribution_paise INTEGER NOT NULL,
      summary_json TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS replay_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      intent_index INTEGER NOT NULL,
      control_paid INTEGER NOT NULL CHECK(control_paid IN (0,1)),
      treatment_paid INTEGER NOT NULL CHECK(treatment_paid IN (0,1)),
      control_contribution_paise INTEGER NOT NULL,
      treatment_contribution_paise INTEGER NOT NULL,
      baseline_blockers TEXT NOT NULL,
      treatment_blockers TEXT NOT NULL,
      metadata TEXT NOT NULL,
      UNIQUE(run_id, intent_index),
      FOREIGN KEY (run_id) REFERENCES replay_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      affected INTEGER NOT NULL,
      newly_converted INTEGER NOT NULL,
      lost_conversions INTEGER NOT NULL,
      net_gmv_delta_paise INTEGER NOT NULL,
      net_incremental_contribution_paise INTEGER NOT NULL,
      status TEXT NOT NULL,
      unmodelled TEXT,
      note TEXT NOT NULL,
      rank INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (run_id) REFERENCES replay_runs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(merchant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_replay_created ON replay_runs(merchant_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_evidence_predicate ON evidence_facts(merchant_id, predicate, created_at DESC);
  `);
}

init();

function initProcurementSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS connected_suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      verification_state TEXT NOT NULL CHECK(verification_state IN ('VERIFIED','UNVERIFIED','SUSPENDED')),
      gst_invoice_enabled INTEGER NOT NULL CHECK(gst_invoice_enabled IN (0,1)),
      reliability_score INTEGER NOT NULL CHECK(reliability_score BETWEEN 0 AND 100),
      eta_days INTEGER NOT NULL CHECK(eta_days >= 0),
      role TEXT NOT NULL CHECK(role IN ('USUAL','CONNECTED','REFERENCE_ONLY')),
      connected INTEGER NOT NULL DEFAULT 1 CHECK(connected IN (0,1)),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supplier_listings (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL,
      product_key TEXT NOT NULL,
      title TEXT NOT NULL,
      gross_case_price_paise INTEGER NOT NULL CHECK(gross_case_price_paise > 0),
      gst_rate TEXT NOT NULL,
      available_cases INTEGER NOT NULL CHECK(available_cases >= 0),
      reserved_cases INTEGER NOT NULL DEFAULT 0 CHECK(reserved_cases >= 0),
      min_cases INTEGER NOT NULL DEFAULT 1 CHECK(min_cases > 0),
      shipping_paise INTEGER NOT NULL DEFAULT 0 CHECK(shipping_paise >= 0),
      updated_at TEXT NOT NULL,
      UNIQUE(supplier_id, product_key),
      CHECK(reserved_cases <= available_cases),
      FOREIGN KEY (supplier_id) REFERENCES connected_suppliers(id)
    );

    CREATE TABLE IF NOT EXISTS retailer_purchase_lines (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      source TEXT NOT NULL,
      supplier_name TEXT NOT NULL,
      purchased_at TEXT NOT NULL,
      product_key TEXT NOT NULL,
      product_name TEXT NOT NULL,
      brand TEXT NOT NULL DEFAULT '',
      pack TEXT NOT NULL DEFAULT '',
      quantity INTEGER NOT NULL CHECK(quantity > 0),
      gross_line_paise INTEGER NOT NULL CHECK(gross_line_paise > 0),
      gst_rate TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id)
    );

    CREATE TABLE IF NOT EXISTS procurement_runs (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      product_key TEXT NOT NULL,
      cases INTEGER NOT NULL CHECK(cases > 0),
      budget_paise INTEGER NOT NULL CHECK(budget_paise > 0),
      deadline_days INTEGER NOT NULL CHECK(deadline_days > 0),
      status TEXT NOT NULL CHECK(status IN ('READY','BLOCKED','CHECKOUT_STARTED','PAID','RECONCILIATION_REQUIRED')),
      selected_listing_id TEXT,
      current_cost_paise INTEGER NOT NULL CHECK(current_cost_paise >= 0),
      recommended_cost_paise INTEGER,
      savings_paise INTEGER NOT NULL DEFAULT 0 CHECK(savings_paise >= 0),
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (selected_listing_id) REFERENCES supplier_listings(id)
    );

    CREATE TABLE IF NOT EXISTS procurement_run_options (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      listing_id TEXT NOT NULL,
      landed_cost_paise INTEGER NOT NULL,
      economic_landed_paise INTEGER NOT NULL,
      savings_vs_usual_paise INTEGER NOT NULL,
      policy_result TEXT NOT NULL CHECK(policy_result IN ('ALLOW','APPROVAL_REQUIRED','BLOCK')),
      rank INTEGER NOT NULL,
      detail_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(run_id, listing_id),
      FOREIGN KEY (run_id) REFERENCES procurement_runs(id) ON DELETE CASCADE,
      FOREIGN KEY (listing_id) REFERENCES supplier_listings(id)
    );

    CREATE TABLE IF NOT EXISTS supplier_reservations (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      run_id TEXT NOT NULL UNIQUE,
      listing_id TEXT NOT NULL,
      cases INTEGER NOT NULL CHECK(cases > 0),
      expires_at TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('ACTIVE','COMMITTED','RELEASED','EXPIRED','RECONCILIATION_REQUIRED')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (run_id) REFERENCES procurement_runs(id),
      FOREIGN KEY (listing_id) REFERENCES supplier_listings(id)
    );

    CREATE TABLE IF NOT EXISTS procurement_orders (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      run_id TEXT NOT NULL UNIQUE,
      reservation_id TEXT NOT NULL UNIQUE,
      razorpay_order_id TEXT UNIQUE,
      razorpay_payment_id TEXT,
      expected_amount_paise INTEGER NOT NULL CHECK(expected_amount_paise > 0),
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (merchant_id) REFERENCES merchants(id),
      FOREIGN KEY (run_id) REFERENCES procurement_runs(id),
      FOREIGN KEY (reservation_id) REFERENCES supplier_reservations(id)
    );

    CREATE INDEX IF NOT EXISTS idx_purchase_memory ON retailer_purchase_lines(merchant_id,purchased_at DESC);
    CREATE INDEX IF NOT EXISTS idx_procurement_runs ON procurement_runs(merchant_id,created_at DESC);
  `);
}

initProcurementSchema();

function seedCoreData() {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`INSERT OR IGNORE INTO merchants (id, name, created_at) VALUES (?, ?, ?)`)
      .run(DEMO.merchantId, DEMO.merchantName, now);
    db.prepare(`INSERT OR IGNORE INTO merchant_tax_configs
      (merchant_id, gst_registered, gstin, invoice_generation_enabled, input_gst_recoverable, gateway_gst_recoverable, updated_at)
      VALUES (?, 1, ?, 1, 1, 1, ?)`)
      .run(DEMO.merchantId, DEMO.gstin, now);
    db.prepare(`INSERT OR IGNORE INTO products
      (merchant_id, sku, name, gross_unit_price_paise, output_gst_rate, economic_unit_cogs_paise, cost_status, cost_source, cost_updated_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'VERIFIED_CURRENT', ?, ?, ?, ?)`)
      .run(DEMO.merchantId, DEMO.sku, DEMO.productName, DEMO.unitGrossPaise, DEMO.outputGstRate, DEMO.unitEconomicCogsPaise, DEMO.costSource, now, now, now);
    const insertLocation = db.prepare(`INSERT OR IGNORE INTO fulfilment_locations
      (merchant_id, id, label, economic_fulfilment_cost_paise, buyer_shipping_charge_paise, role, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    insertLocation.run(DEMO.merchantId, DEMO.locations.central.id, DEMO.locations.central.label, DEMO.locations.central.fulfilmentCostPaise, DEMO.locations.central.buyerShippingChargePaise, "DEFAULT_B2B", now);
    insertLocation.run(DEMO.merchantId, DEMO.locations.edge.id, DEMO.locations.edge.label, DEMO.locations.edge.fulfilmentCostPaise, DEMO.locations.edge.buyerShippingChargePaise, "SCARCE_LOCAL_RESCUE", now);
  });
  tx();
}

seedCoreData();

function seedProcurementData() {
  const now = new Date().toISOString();
  const supplier = db.prepare(`INSERT OR IGNORE INTO connected_suppliers(id,name,verification_state,gst_invoice_enabled,reliability_score,eta_days,role,connected,created_at) VALUES(?,?,?,?,?,?,?,?,?)`);
  for (const s of PROCUREMENT.suppliers) supplier.run(s.id,s.name,s.verification,s.gstInvoice?1:0,s.reliability,s.etaDays,s.role,1,now);
  const listing = db.prepare(`INSERT OR IGNORE INTO supplier_listings(id,supplier_id,product_key,title,gross_case_price_paise,gst_rate,available_cases,reserved_cases,min_cases,shipping_paise,updated_at) VALUES(?,?,?,?,?,?,?,0,?,?,?)`);
  for (const l of PROCUREMENT.listings) {
    const product = PROCUREMENT.products.find((p)=>p.key===l.productKey)!;
    listing.run(`${l.supplierId}__${l.productKey}`,l.supplierId,l.productKey,l.title,l.casePricePaise,product.gstRate,l.availableCases,l.minCases,l.shippingPaise,now);
  }
  const purchaseCount = db.prepare(`SELECT COUNT(*) n FROM retailer_purchase_lines WHERE merchant_id=?`).get(DEMO.merchantId) as {n:number};
  if (Number(purchaseCount.n) === 0) {
    const ins = db.prepare(`INSERT INTO retailer_purchase_lines(id,merchant_id,source,supplier_name,purchased_at,product_key,product_name,brand,pack,quantity,gross_line_paise,gst_rate,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const rows = [
      ['seed_oil_1','2026-08-03','fortune-sunflower-oil-1l-case48','Fortune Sunflower Oil 1L · Case of 48','Fortune','1L × 48',48,792000,'0.05'],
      ['seed_oil_2','2026-08-15','fortune-sunflower-oil-1l-case48','Fortune Sunflower Oil 1L · Case of 48','Fortune','1L × 48',48,803000,'0.05'],
      ['seed_oil_3','2026-08-27','fortune-sunflower-oil-1l-case48','Fortune Sunflower Oil 1L · Case of 48','Fortune','1L × 48',48,812000,'0.05'],
      ['seed_maggi_1','2026-08-01','maggi-masala-70g-case96','Maggi Masala Noodles 70g · Case of 96','Maggi','70g × 96',96,1170000,'0.12'],
      ['seed_maggi_2','2026-08-18','maggi-masala-70g-case96','Maggi Masala Noodles 70g · Case of 96','Maggi','70g × 96',96,1190000,'0.12'],
      ['seed_surf_1','2026-07-30','surf-excel-matic-1kg-case24','Surf Excel Matic 1kg · Case of 24','Surf Excel','1kg × 24',24,2480000,'0.18'],
      ['seed_surf_2','2026-08-25','surf-excel-matic-1kg-case24','Surf Excel Matic 1kg · Case of 24','Surf Excel','1kg × 24',24,2520000,'0.18']
    ];
    for (const r of rows) ins.run(r[0],DEMO.merchantId,'SEEDED_DEMO_PURCHASE_HISTORY','ABC Wholesale',r[1],r[2],r[3],r[4],r[5],r[6],r[7],r[8],now);
  }
}

seedProcurementData();

export function resetInventory() {
  const now = new Date().toISOString();
  const upsert = db.prepare(`
    INSERT INTO inventory_location (merchant_id, sku, location_id, on_hand_qty, reserved_qty, updated_at)
    VALUES (?, ?, ?, ?, 0, ?)
    ON CONFLICT(merchant_id, sku, location_id) DO UPDATE SET
      on_hand_qty=excluded.on_hand_qty,
      reserved_qty=0,
      updated_at=excluded.updated_at
  `);
  const tx = db.transaction(() => {
    upsert.run(DEMO.merchantId, DEMO.sku, DEMO.locations.central.id, DEMO.locations.central.stock, now);
    upsert.run(DEMO.merchantId, DEMO.sku, DEMO.locations.edge.id, DEMO.locations.edge.stock, now);
  });
  tx();
}

export function ensureInventory() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM inventory_location WHERE merchant_id=? AND sku=?").get(DEMO.merchantId, DEMO.sku) as { n: number };
  if (Number(row.n) < 2) resetInventory();
}

ensureInventory();
