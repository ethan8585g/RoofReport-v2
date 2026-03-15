-- Call Center Phone Setup: Quick Connect for outbound AI dialer
-- Separate from Secretary phone config — this is for the admin call center

CREATE TABLE IF NOT EXISTS cc_phone_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL DEFAULT 'Primary Outbound Line',
  business_phone TEXT DEFAULT '',
  assigned_phone_number TEXT DEFAULT '',
  connection_status TEXT DEFAULT 'not_started',
  forwarding_method TEXT DEFAULT '',
  phone_verified INTEGER DEFAULT 0,
  phone_verified_at TEXT DEFAULT NULL,
  verification_code TEXT DEFAULT NULL,
  verification_expires TEXT DEFAULT NULL,
  livekit_inbound_trunk_id TEXT DEFAULT '',
  livekit_outbound_trunk_id TEXT DEFAULT '',
  livekit_dispatch_rule_id TEXT DEFAULT '',
  livekit_sip_uri TEXT DEFAULT '',
  twilio_phone_sid TEXT DEFAULT '',
  is_active INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cc_phone_config_status ON cc_phone_config(connection_status);
