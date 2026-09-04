-- ShadowFunnel schema snapshot. Runtime initialization in lib/db.ts is idempotent and uses the same DDL.
PRAGMA foreign_keys = ON;

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
