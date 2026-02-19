-- ============================================================
-- Migration 0012: Switch payment provider from Stripe to Square
-- Adds: Square payment tables, Square customer ID link,
--        Square webhook events tracking
-- ============================================================

-- Add Square customer ID to customers table (keeps stripe_customer_id for historical data)
ALTER TABLE customers ADD COLUMN square_customer_id TEXT;
CREATE INDEX IF NOT EXISTS idx_customers_square ON customers(square_customer_id);

-- Square payment records (every checkout / payment link)
CREATE TABLE IF NOT EXISTS square_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  -- Square-specific IDs
  square_payment_link_id TEXT,     -- From CreatePaymentLink response
  square_order_id TEXT,             -- Square order associated with the payment link
  square_payment_id TEXT,           -- The actual payment ID after completion
  -- Payment details
  amount INTEGER NOT NULL,          -- in cents (CAD)
  currency TEXT DEFAULT 'cad',
  status TEXT DEFAULT 'pending',    -- pending, succeeded, failed, refunded
  payment_type TEXT NOT NULL,       -- 'one_time_report', 'credit_pack'
  -- Descriptions & metadata
  description TEXT,
  metadata_json TEXT,               -- JSON blob for storing order context (address, tier, etc.)
  -- Linked order (if paying for a specific report)
  order_id INTEGER,
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_square_payments_customer ON square_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_square_payments_link ON square_payments(square_payment_link_id);
CREATE INDEX IF NOT EXISTS idx_square_payments_order ON square_payments(square_order_id);
CREATE INDEX IF NOT EXISTS idx_square_payments_status ON square_payments(status);

-- Square webhook events log (idempotency tracking)
CREATE TABLE IF NOT EXISTS square_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  square_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed INTEGER DEFAULT 0,
  payload TEXT,   -- full JSON payload
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_square_webhook_events ON square_webhook_events(square_event_id);
