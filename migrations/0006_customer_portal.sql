-- ============================================================
-- Migration 0006: Customer Portal, Invoices & Sales Tracking
-- Adds: customers table (Google Sign-In + email/password),
--        invoices, invoice_items, customer_orders link
-- ============================================================

-- Customers (end-users who order roof reports)
-- Separate from admin_users - these are clients
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  company_name TEXT,
  -- Google OAuth2 fields
  google_id TEXT UNIQUE,
  google_avatar TEXT,
  -- Password auth (optional if using Google Sign-In)
  password_hash TEXT,
  -- Address
  address TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  -- Status
  is_active INTEGER DEFAULT 1,
  email_verified INTEGER DEFAULT 0,
  last_login TEXT,
  -- Metadata
  notes TEXT,
  tags TEXT, -- JSON array of tags for categorization
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_google_id ON customers(google_id);
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_name);

-- Link orders to customers (existing orders table gets a customer_id)
-- We add customer_id column to orders table
ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER NOT NULL,
  order_id INTEGER, -- optional link to a specific order
  -- Amounts
  subtotal REAL NOT NULL DEFAULT 0,
  tax_rate REAL DEFAULT 5.0, -- GST 5%
  tax_amount REAL DEFAULT 0,
  discount_amount REAL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'CAD',
  -- Status
  status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled', 'refunded')),
  -- Dates
  issue_date TEXT DEFAULT (date('now')),
  due_date TEXT,
  paid_date TEXT,
  sent_date TEXT,
  -- Payment info
  payment_method TEXT,
  payment_reference TEXT,
  -- Details
  notes TEXT,
  terms TEXT DEFAULT 'Payment due within 30 days of invoice date.',
  -- Metadata
  created_by TEXT, -- admin email who created it
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);

-- Invoice line items
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);

-- Customer sessions (for proper token validation)
CREATE TABLE IF NOT EXISTS customer_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  session_token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer ON customer_sessions(customer_id);
