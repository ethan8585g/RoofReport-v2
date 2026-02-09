-- ============================================================
-- Migration 0002: Add 3D roof area fields
-- Roofs are slanted. The flat "footprint" seen from above is
-- SMALLER than the true surface area a roofer needs to cover.
-- This migration adds explicit fields for both measurements.
-- ============================================================

-- Add footprint (flat/2D) fields alongside existing true area fields
ALTER TABLE reports ADD COLUMN roof_footprint_sqft REAL;
ALTER TABLE reports ADD COLUMN roof_footprint_sqm REAL;

-- Area multiplier: how much bigger the true 3D area is vs footprint
-- e.g. 1.15 means the roof is 15% larger than it looks from above
ALTER TABLE reports ADD COLUMN area_multiplier REAL;

-- Pitch expressed as rise:12 ratio (roofing industry standard)
ALTER TABLE reports ADD COLUMN roof_pitch_ratio TEXT;
