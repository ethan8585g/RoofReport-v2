-- ============================================================
-- Migration 0024: AI-Generated Imagery
-- Adds column to store AI-generated report images
-- ============================================================

-- Add ai_generated_imagery_json column to reports table
-- Stores JSON blob of AI-generated images (base64 data URLs)
ALTER TABLE reports ADD COLUMN ai_generated_imagery_json TEXT;

-- Add ai_imagery_status to track generation progress
-- Values: null (not started), 'generating', 'completed', 'failed'
ALTER TABLE reports ADD COLUMN ai_imagery_status TEXT;
ALTER TABLE reports ADD COLUMN ai_imagery_error TEXT;
