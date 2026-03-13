-- ============================================================
-- Migration 0035: Secretary 3-Mode System
-- Mode 1: directory     — Directory routing service (Press 1 for Sales, 2 for Service…)
-- Mode 2: answering     — Never-go-to-voicemail answering service (take messages, forward urgents)
-- Mode 3: full          — Full AI Secretary (book appointments, answer FAQs, schedule callbacks, send emails)
-- ============================================================

-- Add mode column + mode-specific config fields
ALTER TABLE secretary_config ADD COLUMN secretary_mode TEXT NOT NULL DEFAULT 'directory';
-- 'directory' | 'answering' | 'full'

-- ── Answering-mode fields ──
ALTER TABLE secretary_config ADD COLUMN answering_fallback_action TEXT DEFAULT 'take_message';
-- 'take_message' | 'forward_urgent' | 'always_forward'
ALTER TABLE secretary_config ADD COLUMN answering_forward_number TEXT DEFAULT '';
ALTER TABLE secretary_config ADD COLUMN answering_sms_notify INTEGER DEFAULT 1;
ALTER TABLE secretary_config ADD COLUMN answering_email_notify INTEGER DEFAULT 1;
ALTER TABLE secretary_config ADD COLUMN answering_notify_email TEXT DEFAULT '';

-- ── Full-secretary-mode fields ──
ALTER TABLE secretary_config ADD COLUMN full_can_book_appointments INTEGER DEFAULT 1;
ALTER TABLE secretary_config ADD COLUMN full_can_send_email INTEGER DEFAULT 1;
ALTER TABLE secretary_config ADD COLUMN full_can_schedule_callback INTEGER DEFAULT 1;
ALTER TABLE secretary_config ADD COLUMN full_can_answer_faq INTEGER DEFAULT 1;
ALTER TABLE secretary_config ADD COLUMN full_can_take_payment_info INTEGER DEFAULT 0;
ALTER TABLE secretary_config ADD COLUMN full_business_hours TEXT DEFAULT '{"mon":"9:00-17:00","tue":"9:00-17:00","wed":"9:00-17:00","thu":"9:00-17:00","fri":"9:00-17:00","sat":"closed","sun":"closed"}';
ALTER TABLE secretary_config ADD COLUMN full_booking_link TEXT DEFAULT '';
ALTER TABLE secretary_config ADD COLUMN full_services_offered TEXT DEFAULT '';
ALTER TABLE secretary_config ADD COLUMN full_pricing_info TEXT DEFAULT '';
ALTER TABLE secretary_config ADD COLUMN full_service_area TEXT DEFAULT '';
ALTER TABLE secretary_config ADD COLUMN full_email_from_name TEXT DEFAULT '';
ALTER TABLE secretary_config ADD COLUMN full_email_signature TEXT DEFAULT '';

-- ── Appointments table (for full mode) ──
CREATE TABLE IF NOT EXISTS secretary_appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  caller_phone TEXT,
  caller_name TEXT,
  caller_email TEXT,
  appointment_date TEXT,
  appointment_time TEXT,
  appointment_type TEXT DEFAULT 'estimate',
  property_address TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, confirmed, cancelled, completed
  created_via TEXT DEFAULT 'phone',        -- phone, web
  call_log_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- ── Scheduled callbacks table (for full mode) ──
CREATE TABLE IF NOT EXISTS secretary_callbacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  caller_phone TEXT NOT NULL,
  caller_name TEXT,
  preferred_time TEXT,
  reason TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending, completed, cancelled
  call_log_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- ── Messages table (for answering mode) ──
CREATE TABLE IF NOT EXISTS secretary_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  caller_phone TEXT,
  caller_name TEXT,
  message_text TEXT NOT NULL,
  urgency TEXT DEFAULT 'normal',  -- normal, urgent, emergency
  is_read INTEGER DEFAULT 0,
  forwarded_to TEXT DEFAULT '',
  call_log_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_secretary_appts_customer ON secretary_appointments(customer_id);
CREATE INDEX IF NOT EXISTS idx_secretary_appts_date ON secretary_appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_secretary_appts_status ON secretary_appointments(status);
CREATE INDEX IF NOT EXISTS idx_secretary_callbacks_customer ON secretary_callbacks(customer_id);
CREATE INDEX IF NOT EXISTS idx_secretary_callbacks_status ON secretary_callbacks(status);
CREATE INDEX IF NOT EXISTS idx_secretary_messages_customer ON secretary_messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_secretary_messages_read ON secretary_messages(is_read);
