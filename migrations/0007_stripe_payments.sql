-- ============================================================
-- Migration 0007: Stripe Payments & Self-Service Subscriptions
-- Adds: stripe customer link, subscription plans, payment intents,
--        credit balance, usage tracking
-- ============================================================

-- Add Stripe fields to customers table
ALTER TABLE customers ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE customers ADD COLUMN subscription_plan TEXT DEFAULT 'free'; -- free, starter, pro, enterprise
ALTER TABLE customers ADD COLUMN subscription_status TEXT DEFAULT 'none'; -- none, active, past_due, cancelled, trialing
ALTER TABLE customers ADD COLUMN subscription_stripe_id TEXT;
ALTER TABLE customers ADD COLUMN report_credits INTEGER DEFAULT 0; -- number of reports they can generate
ALTER TABLE customers ADD COLUMN credits_used INTEGER DEFAULT 0;
ALTER TABLE customers ADD COLUMN subscription_start TEXT;
ALTER TABLE customers ADD COLUMN subscription_end TEXT;

CREATE INDEX IF NOT EXISTS idx_customers_stripe ON customers(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_customers_plan ON customers(subscription_plan);

-- Stripe payment records (every checkout / payment intent)
CREATE TABLE IF NOT EXISTS stripe_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT,
  -- Payment details
  amount INTEGER NOT NULL, -- in cents (CAD)
  currency TEXT DEFAULT 'cad',
  status TEXT DEFAULT 'pending', -- pending, succeeded, failed, refunded
  payment_type TEXT NOT NULL, -- 'one_time_report', 'credit_pack', 'subscription'
  -- Descriptions
  description TEXT,
  metadata TEXT, -- JSON
  -- Linked order (if paying for a specific report)
  order_id INTEGER,
  -- Timestamps
  stripe_created TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE INDEX IF NOT EXISTS idx_stripe_payments_customer ON stripe_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_intent ON stripe_payments(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_session ON stripe_payments(stripe_checkout_session_id);
CREATE INDEX IF NOT EXISTS idx_stripe_payments_status ON stripe_payments(status);

-- Credit purchase packages (admin-configurable)
CREATE TABLE IF NOT EXISTS credit_packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  credits INTEGER NOT NULL, -- number of report credits included
  price_cents INTEGER NOT NULL, -- price in cents (CAD)
  stripe_price_id TEXT, -- Stripe Price object ID for checkout
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Insert default credit packages
INSERT INTO credit_packages (name, description, credits, price_cents, sort_order) VALUES
  ('Single Report', 'One professional roof measurement report', 1, 1500, 1),
  ('5-Pack', 'Five reports — save 20%', 5, 6000, 2),
  ('10-Pack', 'Ten reports — save 30%', 10, 10500, 3),
  ('25-Pack', 'Twenty-five reports — save 40%', 25, 22500, 4),
  ('50-Pack', 'Fifty reports — best value, save 50%', 50, 37500, 5);

-- Webhook events log (for Stripe webhook idempotency)
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed INTEGER DEFAULT 0,
  payload TEXT, -- full JSON payload
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe ON stripe_webhook_events(stripe_event_id);
