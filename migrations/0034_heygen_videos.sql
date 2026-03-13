-- ============================================================
-- HeyGen AI Video Generation — Marketing & Report Videos
-- Stores video generation jobs, templates, and results
-- ============================================================

-- Video generation jobs
CREATE TABLE IF NOT EXISTS heygen_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id TEXT UNIQUE,                  -- HeyGen video_id returned by API
  title TEXT NOT NULL,                    -- User-friendly title
  category TEXT NOT NULL DEFAULT 'marketing',  -- marketing | report_walkthrough | social | ad | training
  status TEXT NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  avatar_id TEXT,                         -- HeyGen avatar ID used
  avatar_name TEXT,                       -- Display name of avatar
  voice_id TEXT,                          -- HeyGen voice ID used
  voice_name TEXT,                        -- Display name of voice
  script TEXT,                            -- The text/script used for the video
  prompt TEXT,                            -- Video Agent prompt (if using prompt mode)
  dimension TEXT DEFAULT '1920x1080',     -- Resolution
  aspect_ratio TEXT DEFAULT '16:9',       -- 16:9, 9:16, 1:1
  duration_seconds REAL,                  -- Video duration once completed
  video_url TEXT,                         -- Final download URL from HeyGen
  thumbnail_url TEXT,                     -- Thumbnail URL
  caption_url TEXT,                       -- Caption/subtitle file URL
  error_message TEXT,                     -- Error details if failed
  -- Report integration (optional)
  order_id INTEGER,                       -- Link to a roof report order
  report_id INTEGER,                      -- Link to a report
  -- Metadata
  heygen_response_raw TEXT,               -- Raw JSON response from HeyGen
  created_by TEXT DEFAULT 'super-admin',  -- Who created it
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME
);

-- Saved video templates / presets for quick reuse
CREATE TABLE IF NOT EXISTS heygen_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                      -- Template name
  category TEXT NOT NULL DEFAULT 'marketing',
  description TEXT,
  avatar_id TEXT,
  voice_id TEXT,
  script_template TEXT,                    -- Script with {{placeholders}}
  prompt_template TEXT,                    -- Video Agent prompt with {{placeholders}}
  dimension TEXT DEFAULT '1920x1080',
  aspect_ratio TEXT DEFAULT '16:9',
  background_color TEXT,
  background_image_url TEXT,
  is_active INTEGER DEFAULT 1,
  usage_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_heygen_videos_status ON heygen_videos(status);
CREATE INDEX IF NOT EXISTS idx_heygen_videos_category ON heygen_videos(category);
CREATE INDEX IF NOT EXISTS idx_heygen_videos_video_id ON heygen_videos(video_id);
CREATE INDEX IF NOT EXISTS idx_heygen_videos_order_id ON heygen_videos(order_id);
CREATE INDEX IF NOT EXISTS idx_heygen_templates_category ON heygen_templates(category);

-- Seed some default marketing templates for RoofReporterAI
INSERT OR IGNORE INTO heygen_templates (name, category, description, script_template, prompt_template) VALUES
  ('Product Intro - RoofReporterAI', 'marketing',
   'Introduction video for RoofReporterAI platform',
   'Welcome to Roof Reporter AI — the most advanced AI-powered roof measurement tool in Canada. Get instant, accurate roof reports with satellite imagery analysis, AI vision inspection, and professional measurement reports. Whether you are a roofing contractor, insurance adjuster, or homeowner, our platform delivers EagleView-quality results at a fraction of the cost. Visit roofreporterai.com to get started today.',
   NULL),
  ('Social Ad - Get Your Roof Measured', 'social',
   'Short social media ad for roof measurement service',
   'Need your roof measured? Skip the ladder. Roof Reporter AI uses satellite imagery and artificial intelligence to deliver a full measurement report in minutes — not days. Accurate square footage, pitch analysis, edge measurements, and material estimates. All from your phone. Try it free at roofreporterai.com.',
   NULL),
  ('Roof Report Walkthrough', 'report_walkthrough',
   'Template for personalized roof report video walkthrough',
   'Hi there! I have great news about your property at {{address}}. Your Roof Reporter AI measurement report is ready. Your roof has a total area of {{total_squares}} squares with a predominant pitch of {{pitch}}. The report includes detailed edge measurements, material estimates, and a waste factor analysis. You can view the full report at the link in the description. If you have any questions, our team is here to help.',
   NULL),
  ('Training - How to Use RoofReporterAI', 'training',
   'Training video for new users',
   'Welcome to the Roof Reporter AI training guide. In this video, I will walk you through how to generate your first roof measurement report. Step one: enter the property address. Step two: our AI will analyze satellite imagery and generate a detailed measurement report. Step three: review your report, which includes roof area, pitch, edges, and material estimates. The entire process takes just minutes. Let us get started.',
   NULL);
