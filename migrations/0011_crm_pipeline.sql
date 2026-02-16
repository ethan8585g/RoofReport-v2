-- ============================================================
-- Migration 0011: CRM Sales Pipeline (Deals)
-- ============================================================

CREATE TABLE IF NOT EXISTS crm_deals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL, -- The user who owns this deal
  crm_customer_id INTEGER,   -- Link to a contact/customer (optional at first?)
  title TEXT NOT NULL,       -- "Roof Replacement for John"
  value REAL DEFAULT 0,      -- Estimated deal value
  stage TEXT DEFAULT 'lead', -- lead, contacted, proposal, won, lost
  notes TEXT,
  priority TEXT DEFAULT 'medium', -- low, medium, high
  expected_close_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (crm_customer_id) REFERENCES crm_customers(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_owner ON crm_deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage);
CREATE INDEX IF NOT EXISTS idx_crm_deals_customer ON crm_deals(crm_customer_id);
