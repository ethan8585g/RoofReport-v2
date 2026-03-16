-- ============================================================
-- Migration 0043: Clarify phone number fields for Secretary AI onboarding
-- personal_phone = customer's personal cell (they forward FROM this)
-- agent_phone_number = purchased Twilio/LiveKit SIP number for the AI agent
-- ============================================================

-- Add explicit personal phone (the customer's own cell they're forwarding calls from)
ALTER TABLE onboarded_customers ADD COLUMN personal_phone TEXT DEFAULT '';

-- Add explicit agent phone number (the Twilio/LiveKit number the AI agent uses)
ALTER TABLE onboarded_customers ADD COLUMN agent_phone_number TEXT DEFAULT '';

-- Add phone provider tracking (twilio, livekit, vonage, etc.)
ALTER TABLE onboarded_customers ADD COLUMN phone_provider TEXT DEFAULT '';

-- Add provider account status
ALTER TABLE onboarded_customers ADD COLUMN provider_account_status TEXT DEFAULT 'pending';
