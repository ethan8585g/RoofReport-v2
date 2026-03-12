-- ============================================================
-- Migration 0029: LiveKit agents, lead capture, auto-email
-- ============================================================

-- 1. Lead capture form submissions
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  email TEXT NOT NULL,
  source_page TEXT DEFAULT 'unknown',
  message TEXT,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

-- 2. Auto-email preference for customers
ALTER TABLE customers ADD COLUMN auto_email_reports INTEGER DEFAULT 0;

-- 3. Agent interaction logs (for report guide, procurement, QA agents)
CREATE TABLE IF NOT EXISTS agent_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_type TEXT NOT NULL,
  customer_id INTEGER,
  reference_id TEXT,
  room_name TEXT,
  caller_phone TEXT,
  summary TEXT,
  transcript TEXT,
  outcome TEXT DEFAULT 'completed',
  duration_seconds INTEGER DEFAULT 0,
  metadata TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_agent_interactions_type ON agent_interactions(agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_interactions_customer ON agent_interactions(customer_id);

-- 4. Supplier directory for procurement agent
CREATE TABLE IF NOT EXISTS supplier_directory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  supplier_type TEXT DEFAULT 'general',
  preferred INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_supplier_owner ON supplier_directory(owner_id);

-- 5. QA follow-up scheduling
CREATE TABLE IF NOT EXISTS qa_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  job_id INTEGER,
  crm_customer_id INTEGER,
  homeowner_name TEXT,
  homeowner_phone TEXT,
  scheduled_at TEXT,
  status TEXT DEFAULT 'pending',
  call_outcome TEXT,
  satisfaction_score INTEGER,
  google_review_sent INTEGER DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_qa_followups_status ON qa_followups(status);
CREATE INDEX IF NOT EXISTS idx_qa_followups_scheduled ON qa_followups(scheduled_at);
