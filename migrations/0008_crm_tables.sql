-- ============================================================
-- Migration 0008: CRM Module Tables
-- Adds: crm_customers, crm_invoices, crm_invoice_items,
--        crm_proposals, crm_jobs, crm_job_checklist
-- These are per-user CRM records (owner_id = customer.id)
-- ============================================================

-- Add free trial columns to customers if missing
ALTER TABLE customers ADD COLUMN free_trial_total INTEGER DEFAULT 3;
ALTER TABLE customers ADD COLUMN free_trial_used INTEGER DEFAULT 0;

-- Add is_trial flag to orders if missing
ALTER TABLE orders ADD COLUMN is_trial INTEGER DEFAULT 0;

-- ============================================================
-- CRM CUSTOMERS — Contacts managed by each logged-in user
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL, -- references customers.id (the logged-in user)
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  company TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  notes TEXT,
  tags TEXT, -- comma-separated tags
  status TEXT DEFAULT 'active', -- active, inactive, lead
  source TEXT, -- referral, website, d2d, cold_call, etc.
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_customers_owner ON crm_customers(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_customers_status ON crm_customers(status);

-- ============================================================
-- CRM INVOICES — Invoices issued by user to their clients
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  crm_customer_id INTEGER NOT NULL,
  invoice_number TEXT NOT NULL,
  subtotal REAL DEFAULT 0,
  tax_rate REAL DEFAULT 5.0,
  tax_amount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  currency TEXT DEFAULT 'CAD',
  status TEXT DEFAULT 'draft', -- draft, sent, viewed, paid, overdue, cancelled
  issue_date TEXT DEFAULT (date('now')),
  due_date TEXT,
  paid_date TEXT,
  sent_date TEXT,
  notes TEXT,
  terms TEXT DEFAULT 'Payment due within 30 days.',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (crm_customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_invoices_owner ON crm_invoices(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_invoices_customer ON crm_invoices(crm_customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_invoices_status ON crm_invoices(status);

-- ============================================================
-- CRM INVOICE ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL DEFAULT 1,
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES crm_invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_invoice_items_inv ON crm_invoice_items(invoice_id);

-- ============================================================
-- CRM PROPOSALS / ESTIMATES
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  crm_customer_id INTEGER NOT NULL,
  proposal_number TEXT NOT NULL,
  title TEXT NOT NULL,
  property_address TEXT,
  scope_of_work TEXT,
  materials_detail TEXT,
  labor_cost REAL DEFAULT 0,
  material_cost REAL DEFAULT 0,
  other_cost REAL DEFAULT 0,
  total_amount REAL DEFAULT 0,
  status TEXT DEFAULT 'draft', -- draft, sent, viewed, accepted, declined, expired
  valid_until TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (crm_customer_id) REFERENCES crm_customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_proposals_owner ON crm_proposals(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_customer ON crm_proposals(crm_customer_id);
CREATE INDEX IF NOT EXISTS idx_crm_proposals_status ON crm_proposals(status);

-- ============================================================
-- CRM JOBS — Roof install / service scheduling
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  crm_customer_id INTEGER,
  proposal_id INTEGER,
  job_number TEXT NOT NULL,
  title TEXT NOT NULL,
  property_address TEXT,
  job_type TEXT DEFAULT 'install', -- install, repair, inspection, maintenance
  scheduled_date TEXT NOT NULL,
  scheduled_time TEXT,
  estimated_duration TEXT, -- e.g. '2 days'
  crew_size INTEGER,
  notes TEXT,
  status TEXT DEFAULT 'scheduled', -- scheduled, in_progress, completed, cancelled, postponed
  completed_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (crm_customer_id) REFERENCES crm_customers(id),
  FOREIGN KEY (proposal_id) REFERENCES crm_proposals(id)
);

CREATE INDEX IF NOT EXISTS idx_crm_jobs_owner ON crm_jobs(owner_id);
CREATE INDEX IF NOT EXISTS idx_crm_jobs_date ON crm_jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_crm_jobs_status ON crm_jobs(status);

-- ============================================================
-- CRM JOB CHECKLIST
-- ============================================================
CREATE TABLE IF NOT EXISTS crm_job_checklist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  item_type TEXT NOT NULL, -- permit, material, dumpster, inspection, custom
  label TEXT NOT NULL,
  is_completed INTEGER DEFAULT 0,
  completed_at TEXT,
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (job_id) REFERENCES crm_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_checklist_job ON crm_job_checklist(job_id);
