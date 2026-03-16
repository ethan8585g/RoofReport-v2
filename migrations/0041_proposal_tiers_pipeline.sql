-- ============================================================
-- Migration 0041: Proposal Tiers, Pipeline, Customer Dashboard
-- ============================================================

-- Proposal groups: ties Good/Better/Best proposals together
ALTER TABLE crm_proposals ADD COLUMN proposal_group_id TEXT DEFAULT '';
ALTER TABLE crm_proposals ADD COLUMN tier_label TEXT DEFAULT '';  -- 'Good', 'Better', 'Best'
ALTER TABLE crm_proposals ADD COLUMN tier_order INTEGER DEFAULT 0;  -- 1, 2, 3
ALTER TABLE crm_proposals ADD COLUMN source_report_id INTEGER DEFAULT NULL;
ALTER TABLE crm_proposals ADD COLUMN source_type TEXT DEFAULT '';  -- 'manual', 'pricing_engine', 'report_auto'

-- Revenue pipeline: track conversion funnel
ALTER TABLE revenue_pipeline ADD COLUMN conversion_date TEXT DEFAULT '';
ALTER TABLE revenue_pipeline ADD COLUMN days_in_stage INTEGER DEFAULT 0;

-- Notifications: add read/dismiss tracking  
ALTER TABLE notifications ADD COLUMN dismissed_at TEXT DEFAULT '';
ALTER TABLE notifications ADD COLUMN action_taken TEXT DEFAULT '';

-- Customer proposal access tokens (for customer dashboard login-free access)
CREATE TABLE IF NOT EXISTS customer_portal_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  customer_email TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_portal_tokens_token ON customer_portal_tokens(token);
CREATE INDEX IF NOT EXISTS idx_portal_tokens_email ON customer_portal_tokens(customer_email);

-- Proposal group index
CREATE INDEX IF NOT EXISTS idx_proposals_group ON crm_proposals(proposal_group_id);
CREATE INDEX IF NOT EXISTS idx_proposals_source ON crm_proposals(source_report_id);
