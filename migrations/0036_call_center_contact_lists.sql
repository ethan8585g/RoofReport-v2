-- ============================================================
-- Migration 0036: Call Center Contact Lists
-- Organized contact lists by area/region for marketing campaigns
-- ============================================================

-- Contact Lists — reusable named lists of prospects grouped by area/purpose
CREATE TABLE IF NOT EXISTS cc_contact_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                      -- e.g. "Edmonton Roofers Q1 2026"
  description TEXT DEFAULT '',
  area TEXT DEFAULT '',                    -- e.g. "Edmonton", "Calgary", "Greater Toronto Area"
  province_state TEXT DEFAULT '',          -- e.g. "AB", "ON", "BC"
  country TEXT DEFAULT 'CA',
  tags TEXT DEFAULT '',                    -- comma-separated tags
  total_contacts INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',            -- active, archived
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Link prospects to contact lists (many-to-many)
CREATE TABLE IF NOT EXISTS cc_contact_list_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL,
  prospect_id INTEGER NOT NULL,
  added_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (list_id) REFERENCES cc_contact_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (prospect_id) REFERENCES cc_prospects(id) ON DELETE CASCADE,
  UNIQUE(list_id, prospect_id)
);

-- Add contact_list_id to campaigns for linking
-- (campaigns can now target a specific contact list)

-- Add agent enhancement columns
-- persona_full: detailed system prompt for how agent responds
-- phone_number: the outbound caller ID / connected phone number
-- greeting_style: how the agent opens calls
-- objection_style: how the agent handles pushback
-- closing_style: how the agent closes/books demos

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cc_contact_lists_area ON cc_contact_lists(area);
CREATE INDEX IF NOT EXISTS idx_cc_contact_lists_status ON cc_contact_lists(status);
CREATE INDEX IF NOT EXISTS idx_cc_list_members_list ON cc_contact_list_members(list_id);
CREATE INDEX IF NOT EXISTS idx_cc_list_members_prospect ON cc_contact_list_members(prospect_id);
