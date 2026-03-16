-- ============================================================
-- Migration 0040: Revenue Pipeline + Notifications + Follow-ups + Payments
-- ============================================================

-- Enhanced crm_proposals: add pricing engine fields, tier data
ALTER TABLE crm_proposals ADD COLUMN pricing_tier TEXT DEFAULT '';
ALTER TABLE crm_proposals ADD COLUMN pricing_engine_data TEXT DEFAULT '';
ALTER TABLE crm_proposals ADD COLUMN deposit_amount REAL DEFAULT 0;
ALTER TABLE crm_proposals ADD COLUMN deposit_paid INTEGER DEFAULT 0;
ALTER TABLE crm_proposals ADD COLUMN deposit_payment_id TEXT DEFAULT '';
ALTER TABLE crm_proposals ADD COLUMN payment_link TEXT DEFAULT '';
ALTER TABLE crm_proposals ADD COLUMN followup_count INTEGER DEFAULT 0;
ALTER TABLE crm_proposals ADD COLUMN last_followup_at TEXT DEFAULT '';
ALTER TABLE crm_proposals ADD COLUMN auto_invoice_id INTEGER DEFAULT NULL;

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  type TEXT NOT NULL, -- proposal_accepted, proposal_declined, invoice_paid, lead_captured, call_answered, followup_due
  title TEXT NOT NULL,
  message TEXT DEFAULT '',
  link TEXT DEFAULT '',
  is_read INTEGER DEFAULT 0,
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notifications_owner ON notifications(owner_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at);

-- Scheduled follow-ups / automations
CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  task_type TEXT NOT NULL, -- proposal_followup, invoice_overdue_reminder, welcome_email
  target_type TEXT DEFAULT '', -- proposal, invoice, customer
  target_id INTEGER DEFAULT 0,
  scheduled_for TEXT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, executed, cancelled
  attempt_count INTEGER DEFAULT 0,
  last_attempt_at TEXT DEFAULT '',
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_due ON scheduled_tasks(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_owner ON scheduled_tasks(owner_id);

-- Webhook endpoints
CREATE TABLE IF NOT EXISTS webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  event_type TEXT NOT NULL, -- proposal_accepted, invoice_paid, lead_captured, etc.
  url TEXT NOT NULL,
  secret TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  last_triggered_at TEXT DEFAULT '',
  failure_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_webhooks_owner ON webhooks(owner_id, is_active);

-- Revenue pipeline tracking
CREATE TABLE IF NOT EXISTS revenue_pipeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  stage TEXT NOT NULL, -- lead, proposal_sent, proposal_viewed, proposal_accepted, invoice_sent, invoice_paid
  amount REAL DEFAULT 0,
  entity_type TEXT DEFAULT '', -- proposal, invoice, lead
  entity_id INTEGER DEFAULT 0,
  customer_name TEXT DEFAULT '',
  property_address TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  moved_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_revenue_pipeline_owner ON revenue_pipeline(owner_id, stage);
CREATE INDEX IF NOT EXISTS idx_revenue_pipeline_date ON revenue_pipeline(created_at);

-- Invoice payments tracking
CREATE TABLE IF NOT EXISTS invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  payment_method TEXT DEFAULT 'stripe', -- stripe, square, manual, cash, check, etransfer
  payment_id TEXT DEFAULT '',
  amount REAL NOT NULL,
  status TEXT DEFAULT 'completed', -- pending, completed, failed, refunded
  metadata TEXT DEFAULT '{}',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id)
);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);
