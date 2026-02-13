-- ============================================================
-- Reuse Canada - Roofing Measurement Tool
-- Database Schema v1.0
-- ============================================================

-- Master companies (your business / service operators)
CREATE TABLE IF NOT EXISTS master_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  logo_url TEXT,
  api_key TEXT UNIQUE,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Customer companies (B2B clients of master company)
CREATE TABLE IF NOT EXISTS customer_companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_company_id INTEGER NOT NULL,
  company_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  province TEXT,
  postal_code TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (master_company_id) REFERENCES master_companies(id)
);

-- Orders (roof measurement requests)
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  master_company_id INTEGER NOT NULL,
  customer_company_id INTEGER,
  -- Property details
  property_address TEXT NOT NULL,
  property_city TEXT,
  property_province TEXT,
  property_postal_code TEXT,
  latitude REAL,
  longitude REAL,
  -- People
  homeowner_name TEXT NOT NULL,
  homeowner_phone TEXT,
  homeowner_email TEXT,
  requester_name TEXT NOT NULL,
  requester_company TEXT,
  requester_email TEXT,
  requester_phone TEXT,
  -- Service tier
  service_tier TEXT NOT NULL CHECK(service_tier IN ('express', 'standard', 'immediate', 'urgent', 'regular')),
  price REAL NOT NULL,
  -- Status
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'processing', 'completed', 'failed', 'refunded', 'cancelled')),
  -- Payment
  payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'paid', 'refunded')),
  payment_intent_id TEXT,
  -- Timing
  estimated_delivery TEXT,
  delivered_at TEXT,
  -- Notes
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (master_company_id) REFERENCES master_companies(id),
  FOREIGN KEY (customer_company_id) REFERENCES customer_companies(id)
);

-- Reports (generated measurement reports)
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL UNIQUE,
  -- Roof data from Google Solar API
  roof_area_sqft REAL,
  roof_area_sqm REAL,
  roof_pitch_degrees REAL,
  roof_azimuth_degrees REAL,
  max_sunshine_hours REAL,
  num_panels_possible INTEGER,
  yearly_energy_kwh REAL,
  -- Segments (JSON array of roof segments)
  roof_segments TEXT,
  -- Imagery
  satellite_image_url TEXT,
  dsm_image_url TEXT,
  mask_image_url TEXT,
  -- Report file
  report_pdf_url TEXT,
  report_html TEXT,
  -- Solar API raw response
  api_response_raw TEXT,
  -- Status
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'generating', 'completed', 'failed')),
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Payments tracking
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  stripe_payment_intent_id TEXT,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'CAD',
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'succeeded', 'failed', 'refunded')),
  payment_method TEXT,
  receipt_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- API request log (audit trail)
CREATE TABLE IF NOT EXISTS api_requests_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER,
  request_type TEXT NOT NULL,
  endpoint TEXT,
  request_payload TEXT,
  response_status INTEGER,
  response_payload TEXT,
  duration_ms INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- User activity log
CREATE TABLE IF NOT EXISTS user_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Settings (key-value for API keys and config)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  master_company_id INTEGER NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  is_encrypted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (master_company_id) REFERENCES master_companies(id),
  UNIQUE(master_company_id, setting_key)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_orders_master_company ON orders(master_company_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_company ON orders(customer_company_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_service_tier ON orders(service_tier);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_customer_companies_master ON customer_companies(master_company_id);
CREATE INDEX IF NOT EXISTS idx_reports_order ON reports(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_api_log_order ON api_requests_log(order_id);
CREATE INDEX IF NOT EXISTS idx_settings_company ON settings(master_company_id);
