-- ============================================================
-- Migration 0014: Rover AI Chatbot — Conversations & Messages
-- Tracks every visitor conversation with the Rover AI assistant
-- ============================================================

-- Conversations table — one row per chat session
CREATE TABLE IF NOT EXISTS rover_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,          -- UUID generated per browser session
  visitor_name TEXT DEFAULT NULL,            -- Name if provided during chat
  visitor_email TEXT DEFAULT NULL,           -- Email if provided during chat
  visitor_phone TEXT DEFAULT NULL,           -- Phone if provided during chat
  visitor_company TEXT DEFAULT NULL,         -- Company if provided
  visitor_ip TEXT DEFAULT NULL,              -- IP address from request
  visitor_user_agent TEXT DEFAULT NULL,      -- Browser user agent
  page_url TEXT DEFAULT NULL,               -- Page where chat was started
  customer_id INTEGER DEFAULT NULL,          -- Linked customer ID if logged in
  status TEXT DEFAULT 'active',              -- active, ended, flagged, archived
  message_count INTEGER DEFAULT 0,           -- Total messages in conversation
  lead_score INTEGER DEFAULT 0,              -- 0-100 lead quality score (AI-assessed)
  lead_status TEXT DEFAULT 'new',            -- new, qualified, contacted, converted, spam
  summary TEXT DEFAULT NULL,                 -- AI-generated conversation summary
  tags TEXT DEFAULT NULL,                    -- Comma-separated tags (e.g., "pricing,estimate,urgent")
  admin_notes TEXT DEFAULT NULL,             -- Admin notes about this conversation
  first_message_at DATETIME DEFAULT NULL,    -- When first message was sent
  last_message_at DATETIME DEFAULT NULL,     -- When last message was sent
  ended_at DATETIME DEFAULT NULL,            -- When conversation ended
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Messages table — every message in every conversation
CREATE TABLE IF NOT EXISTS rover_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  role TEXT NOT NULL,                        -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,                     -- Message text
  tokens_used INTEGER DEFAULT 0,             -- Token count for this message
  model TEXT DEFAULT NULL,                   -- AI model used (e.g., gpt-5-mini)
  response_time_ms INTEGER DEFAULT 0,        -- Time taken to generate response
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES rover_conversations(id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_rover_conversations_session ON rover_conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_rover_conversations_status ON rover_conversations(status);
CREATE INDEX IF NOT EXISTS idx_rover_conversations_lead_status ON rover_conversations(lead_status);
CREATE INDEX IF NOT EXISTS idx_rover_conversations_customer ON rover_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_rover_conversations_created ON rover_conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_rover_messages_conversation ON rover_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_rover_messages_role ON rover_messages(role);
