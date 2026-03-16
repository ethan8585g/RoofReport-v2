-- ============================================================
-- Migration 0042: Customer Onboarding + Cold Call Invoicing + Call Center Management
-- ============================================================

-- Onboarded customers tracking
CREATE TABLE IF NOT EXISTS onboarded_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL, -- links to customers table (roofer user account)
  business_name TEXT DEFAULT '',
  contact_name TEXT DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT DEFAULT '',
  secretary_enabled INTEGER DEFAULT 0,
  secretary_phone_number TEXT DEFAULT '', -- LiveKit purchased number
  secretary_mode TEXT DEFAULT 'receptionist', -- receptionist, answering_service, always_on
  call_forwarding_number TEXT DEFAULT '', -- their cell/business number
  setup_fee_paid INTEGER DEFAULT 0,
  monthly_subscription_active INTEGER DEFAULT 0,
  onboarded_by TEXT DEFAULT 'super_admin',
  notes TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX IF NOT EXISTS idx_onboarded_customers ON onboarded_customers(customer_id);

-- Cold call service invoices
CREATE TABLE IF NOT EXISTS service_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_email TEXT NOT NULL,
  customer_name TEXT DEFAULT '',
  customer_phone TEXT DEFAULT '',
  items TEXT DEFAULT '[]', -- JSON array of line items
  subtotal REAL DEFAULT 0,
  tax_rate REAL DEFAULT 5,
  tax_amount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  status TEXT DEFAULT 'draft', -- draft, sent, viewed, paid, overdue, cancelled
  payment_link TEXT DEFAULT '',
  due_date TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  sent_at TEXT DEFAULT '',
  paid_at TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_service_invoices_status ON service_invoices(status);
CREATE INDEX IF NOT EXISTS idx_service_invoices_email ON service_invoices(customer_email);

-- Sales scripts library
CREATE TABLE IF NOT EXISTS sales_scripts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'cold_call', -- cold_call, follow_up, demo, close, objection_handler
  script_body TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  is_active INTEGER DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Call center daily stats cache
CREATE TABLE IF NOT EXISTS cc_daily_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  total_calls INTEGER DEFAULT 0,
  connected INTEGER DEFAULT 0,
  demos_booked INTEGER DEFAULT 0,
  converted INTEGER DEFAULT 0,
  total_duration_seconds INTEGER DEFAULT 0,
  avg_call_seconds INTEGER DEFAULT 0,
  top_agent TEXT DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date)
);

-- Damage report cache for reports
ALTER TABLE reports ADD COLUMN damage_report_html TEXT DEFAULT '';
ALTER TABLE reports ADD COLUMN damage_analysis_json TEXT DEFAULT '';
