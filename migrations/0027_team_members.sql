-- ============================================================
-- Migration 0027: Team Members — Multi-user account access
-- Each account owner (customer) can add team members (salespeople)
-- at $50/user/month. Team members get full access to:
--   - Order reports on owner's account
--   - CRM (customers, invoices, proposals, jobs, pipeline)
--   - Roof Secretary AI
--   - All dashboard features
-- ============================================================

-- Team Members — active seats on an account
CREATE TABLE IF NOT EXISTS team_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- The account owner (the customer who pays)
  owner_id INTEGER NOT NULL,
  -- The team member's own customer account (they register separately)
  member_customer_id INTEGER,
  -- Invitation / identity
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  -- Role: 'admin' (full access + can manage team), 'member' (full access, no team mgmt)
  role TEXT NOT NULL DEFAULT 'member',
  -- Status: 'active', 'suspended', 'removed'
  status TEXT NOT NULL DEFAULT 'active',
  -- Billing
  monthly_rate_cents INTEGER DEFAULT 5000,  -- $50.00/month
  billing_started_at TEXT,
  billing_paused_at TEXT,
  -- Permissions (JSON flags — future extensibility)
  permissions TEXT DEFAULT '{"orders":true,"crm":true,"secretary":true,"reports":true,"virtual_tryon":true}',
  -- Timestamps
  joined_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  -- Constraints
  FOREIGN KEY (owner_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (member_customer_id) REFERENCES customers(id) ON DELETE SET NULL
);

-- Team Invitations — pending invites
CREATE TABLE IF NOT EXISTS team_invitations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  -- Invite token (sent via email link)
  invite_token TEXT UNIQUE NOT NULL,
  -- Status: 'pending', 'accepted', 'expired', 'cancelled'
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  -- The resulting team_member id after acceptance
  team_member_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id)
);

-- Team billing ledger — monthly charges for each seat
CREATE TABLE IF NOT EXISTS team_billing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  team_member_id INTEGER NOT NULL,
  -- Billing period
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 5000,
  -- Status: 'pending', 'charged', 'failed', 'waived'
  status TEXT NOT NULL DEFAULT 'pending',
  -- Square payment reference
  square_payment_id TEXT,
  charged_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (team_member_id) REFERENCES team_members(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_team_members_owner ON team_members(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_members_member ON team_members(member_customer_id);
CREATE INDEX IF NOT EXISTS idx_team_members_email ON team_members(email);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status);
CREATE INDEX IF NOT EXISTS idx_team_invitations_owner ON team_invitations(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(invite_token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_billing_owner ON team_billing(owner_id);
CREATE INDEX IF NOT EXISTS idx_team_billing_member ON team_billing(team_member_id);

-- Add team columns to customers table
-- team_owner_id: if this customer is a team member, who is their owner?
-- This allows the auth middleware to resolve "acting as" the owner's account
