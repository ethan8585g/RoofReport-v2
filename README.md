# Reuse Canada - Roofing Measurement Tool

## Project Overview
- **Name**: Reuse Canada Roofing Measurement Tool
- **Version**: 2.1 (Vertex AI Engine Integration)
- **Goal**: Professional roof measurement reports with AI-powered geometry extraction
- **Features**: Google Solar API, Gemini Vision AI, Vertex AI Engine, Material BOM, Edge Analysis

## URLs
- **Live Sandbox**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai
- **Quick Measure (Vertex AI)**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/measure
- **Admin Dashboard**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/admin
- **Health Check**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/api/health

## Architecture

### Dual AI Engine System
The tool uses two AI pipelines:

**1. Google Solar API Pipeline (Standard)**
- Fetches building insights from `solar.googleapis.com`
- Returns 12-58 roof segments with pitch, azimuth, area
- Generates edge breakdown, material BOM, quality scores
- Output: Full professional measurement report (v2.0)

**2. Vertex AI / Gemini Vision Engine (AI Measurement)**
- Fetches satellite imagery from Google Static Maps
- Sends to Gemini Vision (gemini-2.0-flash) for roof geometry extraction
- Returns facets (polygons), structural lines, obstructions
- Generates AI assessment report with material suggestions, difficulty score, cost range
- SVG overlay visualization on satellite imagery

### Authentication Modes
```
Mode 1: Gemini REST API (Development)
  Key: GOOGLE_VERTEX_API_KEY (AIzaSy... format)
  Endpoint: generativelanguage.googleapis.com/v1beta/models/...
  Requires: Generative Language API enabled in GCP

Mode 2: Vertex AI Platform (Production)
  Key: GOOGLE_CLOUD_ACCESS_TOKEN (OAuth2 Bearer)
  Config: GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION
  Endpoint: {location}-aiplatform.googleapis.com/v1/publishers/google/models/...
  Source: gcloud auth print-access-token
```

## Pages & Routes

| Route | Description |
|-------|------------|
| `/` | Main order form — 5-step flow (service tier, location, homeowner, requester, review) |
| `/measure` | **NEW** Standalone Vertex AI Measure Tool — MapCanvas + Places Autocomplete + Gemini Vision |
| `/order/:id` | Order confirmation with Solar report + AI Measurement Engine overlay |
| `/admin` | Admin dashboard — orders, revenue, stats |
| `/settings` | API key configuration |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check with env status + Vertex AI mode |
| GET | `/api/config/client` | Client-safe config (maps key, features) |
| POST | `/api/orders` | Create new order |
| POST | `/api/orders/:id/pay` | Process payment |
| POST | `/api/reports/:id/generate` | Generate Solar API report (v2.0) |
| GET | `/api/reports/:id` | Get report data |
| GET | `/api/reports/:id/html` | Professional HTML report |
| **POST** | **`/api/ai/measure`** | **Quick Measure — lat/lng → Gemini Vision geometry** |
| POST | `/api/ai/:orderId/analyze` | Full AI analysis for an order |
| GET | `/api/ai/:orderId` | Retrieve stored AI analysis |
| **POST** | **`/api/ai/vertex-proxy`** | **Vertex AI Platform proxy (for frontend SDK calls)** |
| POST | `/api/admin/init-db` | Initialize database |
| GET | `/api/admin/dashboard` | Admin analytics |

## Data Architecture

### Storage
- **Cloudflare D1** — SQLite database for orders, reports, payments, companies
- Tables: `orders`, `reports`, `payments`, `customer_companies`, `master_companies`, `api_requests_log`, `user_activity_log`, `settings`
- AI columns in reports: `ai_measurement_json`, `ai_report_json`, `ai_satellite_url`, `ai_analyzed_at`, `ai_status`, `ai_error`

### Key Data Types
- **RoofReport** (v2.0): Segments, edges, materials, solar data, imagery, quality
- **AIMeasurementAnalysis**: Facets (polygons 0-1000), lines (RIDGE/HIP/VALLEY/EAVE/RAKE), obstructions
- **AIReportData**: Summary, material suggestion, difficulty score (1-10), estimated cost range (CAD)

## Tech Stack
- **Runtime**: Cloudflare Workers + Hono
- **Frontend**: Vanilla JS + Tailwind CSS (CDN) + Chart.js
- **Maps**: Google Maps JavaScript API + Google Static Maps
- **AI**: Gemini 2.0 Flash (Vision + Text) via REST or Vertex AI Platform
- **Database**: Cloudflare D1 (SQLite)
- **Build**: Vite + TypeScript

## Files Added/Modified (Vertex AI Engine)

### New Files
- `src/services/gemini.ts` — Dual-mode Gemini API client (REST + Vertex AI Platform)
- `src/routes/ai-analysis.ts` — AI analysis routes + /api/measure + /api/vertex-proxy
- `public/static/measure.js` — Standalone Measure page (MapCanvas + SVG overlay + MeasurementPanel)
- `public/static/vertex-ai-proxy.js` — Frontend fetch interceptor for Vertex AI SDK calls
- `migrations/0004_ai_measurement_engine.sql` — DB migration for AI columns

### Modified Files
- `src/types.ts` — Added GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION, GOOGLE_CLOUD_ACCESS_TOKEN bindings
- `src/index.tsx` — Added /measure route, Vertex AI health info, AI Measure nav link
- `.dev.vars` — Added GCP project config (helpful-passage-486204-h9)

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `GOOGLE_SOLAR_API_KEY` | Solar API for building insights | Yes |
| `GOOGLE_MAPS_API_KEY` | Maps JS API + Static Maps | Yes |
| `GOOGLE_VERTEX_API_KEY` | Gemini REST API (AIzaSy... format) | For Mode 1 |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | For Mode 2 |
| `GOOGLE_CLOUD_LOCATION` | GCP region (e.g. global) | For Mode 2 |
| `GOOGLE_CLOUD_ACCESS_TOKEN` | OAuth2 Bearer token | For Mode 2 |
| `STRIPE_SECRET_KEY` | Stripe payments | Optional |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | Optional |

## Action Required

### Enable Generative Language API
The Gemini Vision engine requires the Generative Language API to be enabled:

**URL**: https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=191664638800

After enabling, the AI engine will:
- Extract roof facets, lines, and obstructions from satellite imagery
- Generate professional AI assessment reports
- Render SVG overlays with color-coded geometry
- Calculate calibrated measurements using scale factors

## Deployment

### Platform: Cloudflare Pages
- **Status**: Development (sandbox)
- **Last Updated**: 2026-02-09
- **Build**: `npm run build` (Vite → dist/_worker.js ~102 KB)
