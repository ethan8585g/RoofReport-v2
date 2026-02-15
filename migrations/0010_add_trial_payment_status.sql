-- ============================================================
-- Migration 0010: Add 'trial' to payment_status CHECK constraint
-- Required for free trial and dev account orders
-- ============================================================

-- SQLite doesn't support ALTER TABLE to modify CHECK constraints
-- We need to recreate the table. Use a pragmatic approach:
-- Drop the constraint by creating a new table and copying data

CREATE TABLE orders_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  master_company_id INTEGER NOT NULL DEFAULT 1,
  customer_company_id INTEGER,
  
  property_address TEXT NOT NULL,
  property_city TEXT,
  property_province TEXT,
  property_postal_code TEXT,
  latitude REAL,
  longitude REAL,
  
  homeowner_name TEXT NOT NULL,
  homeowner_phone TEXT,
  homeowner_email TEXT,
  
  requester_name TEXT,
  requester_company TEXT,
  requester_email TEXT,
  requester_phone TEXT,
  
  service_tier TEXT DEFAULT 'standard' CHECK(service_tier IN ('express', 'standard', 'immediate', 'urgent', 'regular')),
  price REAL NOT NULL,
  
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'processing', 'completed', 'failed', 'refunded', 'cancelled')),
  
  payment_status TEXT DEFAULT 'unpaid' CHECK(payment_status IN ('unpaid', 'paid', 'refunded', 'trial')),
  payment_intent_id TEXT,
  
  estimated_delivery TEXT,
  delivered_at TEXT,
  
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  customer_id INTEGER REFERENCES customers(id),
  is_trial INTEGER DEFAULT 0,
  FOREIGN KEY (master_company_id) REFERENCES master_companies(id),
  FOREIGN KEY (customer_company_id) REFERENCES customer_companies(id)
);

INSERT INTO orders_new SELECT * FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);
