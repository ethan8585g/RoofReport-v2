-- ============================================================
-- Migration 0021: Report Enhancement Webhook Pipeline
-- Adds columns to support async AI enhancement of reports
-- Flow: generate → enhancing → enhanced (or stays completed)
-- ============================================================

-- Enhancement status tracking on reports table
ALTER TABLE reports ADD COLUMN enhancement_status TEXT DEFAULT NULL;
-- NULL = no enhancement requested
-- 'sent' = sent to Cloud Run AI Studio for enhancement
-- 'enhancing' = Cloud Run acknowledged, processing
-- 'enhanced' = Enhanced report received and saved
-- 'enhancement_failed' = Enhancement failed (original report still valid)

-- Enhanced report HTML (replaces original when available)
ALTER TABLE reports ADD COLUMN enhanced_report_html TEXT DEFAULT NULL;

-- Enhanced raw API response (full JSON from Cloud Run)
ALTER TABLE reports ADD COLUMN enhanced_api_response_raw TEXT DEFAULT NULL;

-- Enhancement metadata
ALTER TABLE reports ADD COLUMN enhancement_version TEXT DEFAULT NULL;
ALTER TABLE reports ADD COLUMN enhancement_sent_at TEXT DEFAULT NULL;
ALTER TABLE reports ADD COLUMN enhancement_completed_at TEXT DEFAULT NULL;
ALTER TABLE reports ADD COLUMN enhancement_error TEXT DEFAULT NULL;
ALTER TABLE reports ADD COLUMN enhancement_processing_time_ms INTEGER DEFAULT NULL;
