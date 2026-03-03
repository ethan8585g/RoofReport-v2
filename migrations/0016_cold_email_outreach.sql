-- ============================================================
-- Migration 0016: Cold Email Outreach — Lists, Contacts & Campaigns
-- Super Admin feature for marketing cold email to roofing companies
-- ============================================================

-- Email Lists — organise contacts into named lists (e.g. "Alberta Roofers", "Ontario Contractors")
CREATE TABLE IF NOT EXISTS email_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  contact_count INTEGER DEFAULT 0,
  tags TEXT,                               -- comma-separated tags
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email Contacts — individual email addresses with optional metadata
CREATE TABLE IF NOT EXISTS email_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  company_name TEXT,
  contact_name TEXT,
  phone TEXT,
  city TEXT,
  province TEXT,
  website TEXT,
  source TEXT,                             -- e.g. "CSV import", "manual", "scraped"
  status TEXT DEFAULT 'active',            -- active, unsubscribed, bounced, complained
  bounce_count INTEGER DEFAULT 0,
  last_sent_at DATETIME,
  last_opened_at DATETIME,
  last_clicked_at DATETIME,
  sends_count INTEGER DEFAULT 0,
  opens_count INTEGER DEFAULT 0,
  clicks_count INTEGER DEFAULT 0,
  tags TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (list_id) REFERENCES email_lists(id) ON DELETE CASCADE,
  UNIQUE(list_id, email)                   -- no duplicate emails within same list
);

CREATE INDEX IF NOT EXISTS idx_email_contacts_list ON email_contacts(list_id);
CREATE INDEX IF NOT EXISTS idx_email_contacts_email ON email_contacts(email);
CREATE INDEX IF NOT EXISTS idx_email_contacts_status ON email_contacts(status);

-- Email Campaigns — a blast / sequence sent to one or more lists
CREATE TABLE IF NOT EXISTS email_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  from_name TEXT DEFAULT 'RoofReporterAI',
  from_email TEXT,                         -- sender address (Gmail or Resend)
  reply_to TEXT,
  body_html TEXT NOT NULL,                 -- full HTML email body
  body_text TEXT,                          -- plain-text fallback
  list_ids TEXT NOT NULL,                  -- comma-separated list IDs to send to
  status TEXT DEFAULT 'draft',             -- draft, sending, paused, completed, failed
  scheduled_at DATETIME,                   -- if scheduled for future send
  started_at DATETIME,
  completed_at DATETIME,
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  open_count INTEGER DEFAULT 0,
  click_count INTEGER DEFAULT 0,
  bounce_count INTEGER DEFAULT 0,
  unsubscribe_count INTEGER DEFAULT 0,
  send_rate_per_minute INTEGER DEFAULT 10, -- throttle to avoid rate limits
  tags TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_status ON email_campaigns(status);

-- Campaign Send Log — per-recipient delivery tracking
CREATE TABLE IF NOT EXISTS email_send_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id INTEGER NOT NULL,
  contact_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  status TEXT DEFAULT 'queued',            -- queued, sent, delivered, opened, clicked, bounced, failed
  sent_at DATETIME,
  opened_at DATETIME,
  clicked_at DATETIME,
  bounced_at DATETIME,
  error_message TEXT,
  resend_message_id TEXT,                  -- Resend API message ID for tracking
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES email_contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_send_log_campaign ON email_send_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_send_log_contact ON email_send_log(contact_id);
CREATE INDEX IF NOT EXISTS idx_send_log_status ON email_send_log(status);

-- Email Templates — reusable email templates for campaigns
CREATE TABLE IF NOT EXISTS email_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  body_text TEXT,
  category TEXT DEFAULT 'marketing',       -- marketing, follow_up, announcement, onboarding
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
