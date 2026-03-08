-- ============================================================
-- Migration 0019: Vision-Based Inspection (Multimodal AI)
-- Adds vision_findings_json column to reports table
-- for storing Gemma 3 / Gemini Vision roof condition analysis
-- ============================================================

ALTER TABLE reports ADD COLUMN vision_findings_json TEXT;
