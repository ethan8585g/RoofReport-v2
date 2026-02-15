-- ============================================================
-- Migration 0009: Report Generation Tracking
-- Adds generation attempt tracking columns to reports table
-- ============================================================

ALTER TABLE reports ADD COLUMN generation_attempts INTEGER DEFAULT 0;
ALTER TABLE reports ADD COLUMN generation_started_at TEXT;
ALTER TABLE reports ADD COLUMN generation_completed_at TEXT;
