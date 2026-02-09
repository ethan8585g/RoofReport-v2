-- ============================================================
-- Migration 0004: AI Measurement Engine (Gemini Vision)
-- Adds columns for storing AI roof geometry analysis results
-- ============================================================

-- AI measurement geometry: JSON with facets, lines, obstructions
ALTER TABLE reports ADD COLUMN ai_measurement_json TEXT;

-- AI roofing assessment report: JSON with summary, material suggestion, etc.
ALTER TABLE reports ADD COLUMN ai_report_json TEXT;

-- Satellite image URL used for AI analysis
ALTER TABLE reports ADD COLUMN ai_satellite_url TEXT;

-- Timestamp of AI analysis
ALTER TABLE reports ADD COLUMN ai_analyzed_at TEXT;

-- AI analysis status: 'pending', 'analyzing', 'completed', 'failed'
ALTER TABLE reports ADD COLUMN ai_status TEXT DEFAULT 'pending';

-- Error message if AI analysis failed
ALTER TABLE reports ADD COLUMN ai_error TEXT;
