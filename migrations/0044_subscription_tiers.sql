-- Migration 0044: Subscription Tiers for Onboarding Wizard
-- Adds subscription tier tracking to customers table
-- Supports 3-tier model: Starter ($49/mo), Professional ($149/mo), Enterprise ($499/mo)

-- Subscription tier (starter | professional | enterprise)
ALTER TABLE customers ADD COLUMN subscription_tier TEXT DEFAULT 'starter';

-- Trial tracking
ALTER TABLE customers ADD COLUMN trial_ends_at TEXT;

-- Monthly report limit based on tier
ALTER TABLE customers ADD COLUMN monthly_report_limit INTEGER DEFAULT 10;

-- Reports used this billing period
ALTER TABLE customers ADD COLUMN monthly_reports_used INTEGER DEFAULT 0;

-- Billing period reset date
ALTER TABLE customers ADD COLUMN billing_period_start TEXT;

-- Square subscription ID for recurring billing
ALTER TABLE customers ADD COLUMN subscription_square_id TEXT;

-- Onboarding completed flag
ALTER TABLE customers ADD COLUMN onboarding_completed INTEGER DEFAULT 0;

-- Onboarding step (tracks where user left off: 1, 2, or 3)
ALTER TABLE customers ADD COLUMN onboarding_step INTEGER DEFAULT 0;

-- Features JSON blob (tier-specific feature flags)
ALTER TABLE customers ADD COLUMN tier_features TEXT;

-- Referral tracking
ALTER TABLE customers ADD COLUMN referred_by INTEGER;
ALTER TABLE customers ADD COLUMN referral_code TEXT;

-- Index for subscription queries
CREATE INDEX IF NOT EXISTS idx_customers_subscription_tier ON customers(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_customers_referral_code ON customers(referral_code);
