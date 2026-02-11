# Reuse Canada - Roofing Measurement Tool

## Project Overview
- **Name**: Reuse Canada Roofing Measurement Tool
- **Version**: 3.1 (Gmail Email Delivery + RAS Yield + 3-Page Professional Reports)
- **Goal**: Professional roof measurement reports with AI-powered geometry extraction, RAS material recovery analysis, and automated email delivery
- **Features**: Marketing landing page, customer conversion funnel, Google Solar API, Gemini Vision AI, Vertex AI Engine, Material BOM, Edge Analysis, RAS Yield Analysis, Gmail API Email Delivery

## URLs
- **Live Sandbox**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai
- **Quick Measure (Vertex AI)**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/measure
- **Admin Dashboard**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/admin
- **Health Check**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/api/health
- **Example Report (Order 17)**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/api/reports/17/html

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

### 3-Page Professional Report
Each report generates a branded 3-page HTML document:

| Page | Theme | Contents |
|------|-------|----------|
| **Page 1** | Dark (#0B1E2F) with cyan accents | Aerial Views, Data Dashboard (Total Area, Pitch, Facets, Waste Factor, Squares), Linear Measurements, Customer Preview |
| **Page 2** | Light blue (#E8F4FD) with navy borders | Primary Roofing Materials, Accessories, Ventilation, Fasteners & Sealants, Waste/Complexity badges |
| **Page 3** | Light grey-blue (#E0ECF5) | Facet Breakdown, Linear Measurements (color-coded), Penetrations, SVG Roof Diagram, RAS Material Recovery Analysis |

### Email Delivery
- **Gmail API** via GCP service account (RS256 JWT auth)
- Email wraps the full 3-page report in a branded email template
- Supports custom recipients and subject overrides
- Requires Gmail API enabled in GCP project

### Authentication Modes
```
Mode 1: GCP Service Account (Production - Recommended)
  Key: GCP_SERVICE_ACCOUNT_KEY (full JSON)
  Auto-generates OAuth2 tokens
  Used for: Gemini Vision, Gmail API, Vertex AI

Mode 2: Gemini REST API (Development)
  Key: GOOGLE_VERTEX_API_KEY (AIzaSy... format)
  Endpoint: generativelanguage.googleapis.com/v1beta/models/...

Mode 3: Vertex AI Platform
  Key: GOOGLE_CLOUD_ACCESS_TOKEN (OAuth2 Bearer)
  Config: GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION
```

## Pages & Routes

| Route | Description |
|-------|------------|
| `/` | Marketing landing page (hero, trust bar, how-it-works, features, pricing, FAQ) |
| `/order/new` | 5-step order form with Google Maps Places autocomplete |
| `/measure` | Standalone Vertex AI Measure Tool |
| `/order/:id` | Order confirmation with Solar report + AI overlay |
| `/admin` | Admin dashboard (orders, revenue, stats) |
| `/settings` | API key configuration |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check with env status + Vertex AI mode |
| GET | `/api/health/gemini` | Gemini API connectivity test |
| GET | `/api/config/client` | Client-safe config (maps key, features) |
| POST | `/api/orders` | Create new order |
| GET | `/api/orders` | List orders (with filters) |
| GET | `/api/orders/:id` | Order details + roof metrics |
| PATCH | `/api/orders/:id/status` | Update order status |
| POST | `/api/orders/:id/pay` | Process payment |
| GET | `/api/orders/stats/summary` | Admin dashboard stats |
| POST | `/api/reports/:id/generate` | Generate Solar API report (v2.0) |
| GET | `/api/reports/:id` | Get report data |
| GET | `/api/reports/:id/html` | Professional 3-page HTML report |
| **POST** | **`/api/reports/:id/email`** | **Email report to recipient** |
| POST | `/api/ai/measure` | Quick Measure (lat/lng to Gemini Vision geometry) |
| POST | `/api/ai/ras-yield` | Quick RAS yield analysis for a location |
| POST | `/api/ai/batch-scan` | Batch Solar API scan (up to 50 locations) |
| POST | `/api/ai/:orderId/analyze` | Full AI analysis for an order |
| GET | `/api/ai/:orderId` | Retrieve stored AI analysis |
| POST | `/api/ai/vertex-proxy` | Vertex AI Platform proxy |
| POST | `/api/admin/init-db` | Initialize database |
| GET | `/api/admin/dashboard` | Admin analytics |

## Data Architecture

### Storage
- **Cloudflare D1** (SQLite)
- Tables: `orders`, `reports`, `payments`, `customer_companies`, `master_companies`, `api_requests_log`, `user_activity_log`, `settings`

### Key Data Types
- **RoofReport** (v2.1): Segments, edges, materials, solar data, imagery, quality, RAS yield
- **RASYieldAnalysis**: Segment classification, binder oil/granule/fiber yields, market value (CAD), processing recommendation
- **AIMeasurementAnalysis**: Facets, structural lines, obstructions
- **MaterialEstimate**: BOM with line items, pricing, complexity

## RAS Material Recovery Analysis
Each report includes a Reuse Canada RAS yield section:
- **Slope Classification**: Low pitch (<=4:12) = binder oil, High pitch (>6:12) = granules, Mixed = both
- **Yield Estimates**: Binder oil (gallons), granules (lbs), fiber (lbs)
- **Market Value**: Alberta pricing in CAD
- **Processing Recommendation**: Routing guidance for Rotto Chopper, screener line, or full RAS line

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `GOOGLE_SOLAR_API_KEY` | Solar API for building insights | Yes |
| `GOOGLE_MAPS_API_KEY` | Maps JS API + Static Maps | Yes |
| `GOOGLE_VERTEX_API_KEY` | Gemini REST API | For Mode 2 |
| `GOOGLE_CLOUD_PROJECT` | GCP project ID | For Mode 3 |
| `GOOGLE_CLOUD_LOCATION` | GCP region | For Mode 3 |
| `GCP_SERVICE_ACCOUNT_KEY` | Full JSON service account key | For Mode 1 (Recommended) |
| `STRIPE_SECRET_KEY` | Stripe payments | Optional |
| `STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | Optional |

## Action Required

### 1. Enable Gmail API (for email delivery)
**URL**: https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=191664638800

After enabling:
1. Configure domain-wide delegation for the service account
2. Add scope: `https://www.googleapis.com/auth/gmail.send`
3. Wait 5 minutes for propagation
4. Test: `POST /api/reports/17/email` with `{"to_email": "ethangourley17@gmail.com"}`

### 2. Enable Generative Language API (for AI Vision)
**URL**: https://console.developers.google.com/apis/api/generativelanguage.googleapis.com/overview?project=191664638800

Test: `curl /api/health/gemini`

## Example Report
- **Order 17**: 51046 Range Road 224, Sherwood Park, AB T8C 1H1
- **Coordinates**: 53.4685, -113.2110
- **Solar API**: 404 (rural property - no coverage), fell back to mock data
- **Report URL**: `/api/reports/17/html`
- **Email**: Pending Gmail API enablement

## Tech Stack
- **Runtime**: Cloudflare Workers + Hono
- **Frontend**: Vanilla JS + Tailwind CSS (CDN) + Chart.js
- **Maps**: Google Maps JavaScript API + Google Static Maps
- **AI**: Gemini 2.0 Flash (Vision + Text) via REST or Vertex AI Platform
- **Database**: Cloudflare D1 (SQLite)
- **Email**: Gmail API via GCP Service Account (RS256 JWT)
- **Build**: Vite + TypeScript

## Deployment
- **Platform**: Cloudflare Pages
- **Status**: Development (sandbox)
- **Last Updated**: 2026-02-11
- **Build**: `npm run build` (Vite -> dist/_worker.js ~142 KB)
