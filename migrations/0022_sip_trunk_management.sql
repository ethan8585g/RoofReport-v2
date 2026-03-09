-- ============================================================
-- Migration 0022: SIP Trunk Management Table
-- Tracks LiveKit SIP trunks created via admin API
-- ============================================================

CREATE TABLE IF NOT EXISTS sip_trunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trunk_id TEXT NOT NULL UNIQUE,          -- LiveKit trunk ID
  trunk_type TEXT NOT NULL DEFAULT 'outbound', -- 'inbound' or 'outbound'
  name TEXT DEFAULT '',
  phone_number TEXT DEFAULT '',           -- Associated phone number
  address TEXT DEFAULT '',                -- SIP trunk host address
  country_code TEXT DEFAULT 'CA',
  auth_username TEXT DEFAULT '',
  dispatch_rule_id TEXT DEFAULT '',       -- For inbound: associated dispatch rule
  status TEXT DEFAULT 'active',           -- active, disabled, deleted
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sip_trunks_type ON sip_trunks(trunk_type);
CREATE INDEX IF NOT EXISTS idx_sip_trunks_status ON sip_trunks(status);
