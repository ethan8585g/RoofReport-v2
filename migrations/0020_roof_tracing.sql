-- Migration: Add roof tracing data and pricing fields to orders
-- Supports user-drawn eaves outline, ridge/hip lines, and per-bundle pricing

ALTER TABLE orders ADD COLUMN roof_trace_json TEXT;
-- JSON structure: {
--   eaves: [{lat, lng}, ...],         -- closed polygon of full eaves outline
--   ridges: [[{lat, lng}, {lat, lng}], ...],  -- ridge line segments
--   hips: [[{lat, lng}, {lat, lng}], ...],    -- hip line segments
--   valleys: [[{lat, lng}, {lat, lng}], ...], -- valley line segments (optional)
--   traced_at: ISO timestamp
-- }

ALTER TABLE orders ADD COLUMN price_per_bundle REAL;
-- Customer's input: their price per bundle (per square) for cost estimation
