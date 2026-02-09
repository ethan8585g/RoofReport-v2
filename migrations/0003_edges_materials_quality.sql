-- ============================================================
-- Migration 0003: Edge measurements, material estimates, quality data
-- Adds the full professional report data model
-- ============================================================

-- Edge measurements JSON: array of EdgeMeasurement objects
-- Contains ridge, hip, valley, eave, rake lengths (plan + true 3D)
ALTER TABLE reports ADD COLUMN edge_measurements TEXT;

-- Edge summary totals (denormalized for fast queries)
ALTER TABLE reports ADD COLUMN total_ridge_ft REAL;
ALTER TABLE reports ADD COLUMN total_hip_ft REAL;
ALTER TABLE reports ADD COLUMN total_valley_ft REAL;
ALTER TABLE reports ADD COLUMN total_eave_ft REAL;
ALTER TABLE reports ADD COLUMN total_rake_ft REAL;

-- Material estimate JSON: full MaterialEstimate object
ALTER TABLE reports ADD COLUMN material_estimate TEXT;

-- Material summary (denormalized for dashboards)
ALTER TABLE reports ADD COLUMN gross_squares REAL;
ALTER TABLE reports ADD COLUMN bundle_count INTEGER;
ALTER TABLE reports ADD COLUMN total_material_cost_cad REAL;
ALTER TABLE reports ADD COLUMN complexity_class TEXT;

-- Data quality fields
ALTER TABLE reports ADD COLUMN imagery_quality TEXT;
ALTER TABLE reports ADD COLUMN imagery_date TEXT;
ALTER TABLE reports ADD COLUMN confidence_score INTEGER;
ALTER TABLE reports ADD COLUMN field_verification_recommended INTEGER DEFAULT 0;

-- Professional report HTML (server-rendered, ready for PDF conversion)
ALTER TABLE reports ADD COLUMN professional_report_html TEXT;

-- Report version tracking
ALTER TABLE reports ADD COLUMN report_version TEXT DEFAULT '2.0';
