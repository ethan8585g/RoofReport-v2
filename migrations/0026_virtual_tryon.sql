-- ============================================================
-- Migration 0026: Virtual Try-On — AI Roof Visualization
-- 
-- Adds the roof_jobs table for tracking AI inpainting jobs
-- dispatched to Replicate. The Replicate job_id is the PK
-- so the webhook can update status without a separate lookup.
-- ============================================================

CREATE TABLE IF NOT EXISTS roof_jobs (
    job_id TEXT PRIMARY KEY,              -- Replicate prediction ID (e.g. "abc123xyz")
    customer_id INTEGER,                  -- FK to customers table (nullable for anonymous)
    order_id TEXT,                         -- FK to orders table (nullable)
    status TEXT NOT NULL DEFAULT 'processing',  -- processing | succeeded | failed | cancelled
    prompt TEXT,                           -- The generation prompt used
    roof_style TEXT DEFAULT 'metal',       -- metal | asphalt | tile | slate | cedar
    roof_color TEXT DEFAULT 'charcoal',    -- charcoal | black | brown | green | red | blue | custom
    original_image_url TEXT,              -- Base64 data URI or hosted URL of uploaded photo
    mask_image_url TEXT,                  -- Base64 data URI or hosted URL of mask
    final_image_url TEXT,                 -- Replicate output URL (set by webhook on success)
    error_message TEXT,                   -- Error details if generation failed
    replicate_model TEXT,                 -- Model version used
    processing_time_ms INTEGER,           -- How long generation took
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast polling by customer
CREATE INDEX IF NOT EXISTS idx_roof_jobs_customer ON roof_jobs(customer_id, created_at DESC);

-- Index for status-based queries (admin monitoring)
CREATE INDEX IF NOT EXISTS idx_roof_jobs_status ON roof_jobs(status);
