# Reuse Canada - Professional Roof Measurement Reports

## Project Overview
- **Name**: Reuse Canada Roof Measurement Reports
- **Version**: 8.0 (LiveKit-Only Phone Verification + AI Secretary)
- **Goal**: Professional roof measurement reports for roofing contractors installing new roofs
- **Features**: Marketing landing page, login/register system, admin dashboard with order management, Google Solar API, **Solar DataLayers GeoTIFF processing**, Material BOM, Edge Analysis, Gmail OAuth2 Email Delivery, PDF download, **Full CRM Suite** (Customers, Invoices, Proposals, Jobs, Sales Pipeline, D2D Manager), **Property Overlap Detection**, **Segment Toggle UI**, **Cloud Run Custom AI (dual-path: Colab model + Gemini fallback)**, **AI Vision Inspection**, **Geospatial Utilities with unit tests**, **Roofer Secretary AI (LiveKit-powered)**, **AI Call Center**

## Deployment
- **Production**: https://roofing-measurement-tool.pages.dev
- **GitHub**: https://github.com/ethan8585g/roofreporter-ai-good-copy
- **Platform**: Cloudflare Pages
- **Status**: Active
- **Last Updated**: 2026-03-16

## Roofer Secretary AI — Phone Verification Flow (v8.0)
### LiveKit-Only Architecture (No Twilio Required)
The phone verification and AI secretary setup now uses **LiveKit only** — no Twilio dependency:

1. **User enters business phone number** (e.g., 780-983-3335)
2. **6-digit verification code generated** and displayed on screen (blue auto-fill card)
3. **User enters or taps to auto-fill** the code
4. **System auto-provisions** via LiveKit:
   - Searches for available US phone numbers via LiveKit PhoneNumberService
   - Purchases a number
   - Creates a SIP dispatch rule (routes calls to AI agent room)
   - Assigns the number to the dispatch rule
5. **AI Secretary is LIVE** — calls to the LiveKit number are answered by the AI voice agent

### Key API Endpoints (Secretary)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/secretary/quick-connect/send-code` | Generate verification code (shown on screen) |
| POST | `/api/secretary/quick-connect/verify` | Verify code + auto-purchase LiveKit number + create dispatch rule |
| GET | `/api/secretary/quick-connect/status` | Get current phone setup status |
| POST | `/api/secretary/subscribe` | Create $249/mo Square subscription |
| GET | `/api/secretary/status` | Get subscription + config status |

### Key API Endpoints (Call Center)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/call-center/quick-connect/send-code` | Generate verification code (shown on screen) |
| POST | `/api/call-center/quick-connect/verify` | Verify code + auto-purchase LiveKit number |
| GET | `/api/call-center/quick-connect/status` | Get phone setup status |

### Required Cloudflare Secrets (for LiveKit telephony)
- `LIVEKIT_API_KEY` — LiveKit Cloud API key
- `LIVEKIT_API_SECRET` — LiveKit Cloud API secret
- `LIVEKIT_URL` — LiveKit Cloud WebSocket URL
- `LIVEKIT_SIP_URI` — LiveKit SIP endpoint URI

### Future Subscriber Flow
When a paying customer ($249.99/mo) sets up Roofer Secretary AI:
1. Subscribe via Square payment
2. Enter their mobile phone number
3. Verification code appears on screen → user enters it
4. LiveKit auto-purchases a dedicated AI phone number
5. Dispatch rule created → AI agent answers inbound calls to that number
6. Customer's phone number is linked to their AI secretary config

## URLs
- **Live Sandbox**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai
- **Login/Register**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/login
- **Admin Dashboard**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/admin
- **Health Check**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/api/health
- **Gmail Status**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/api/auth/gmail/status
- **Example Report (Order 17)**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/api/reports/17/html

## User Flow
1. Visitor lands on marketing page (/) with modern white/blue theme
2. Clicks "Order Report" or "Login" -> redirected to /login
3. Creates account or signs in
4. Redirected to /admin dashboard
5. Can order reports, view orders, track sales, manage companies
6. Reports are generated via Google Solar API (urban) or estimated data (rural)
7. Professional 3-page PDF-ready HTML reports delivered via email (Gmail OAuth2)

## Authentication
- First registered user gets **superadmin** role
- Login/register at `/login`
- Admin dashboard requires authentication (auto-redirects to login)
- Password hashing: SHA-256 + UUID salt via Web Crypto API
- Default admin: ethangourley17@gmail.com

## 3-Page Professional Report
Each report generates a branded 3-page HTML document:

| Page | Theme | Contents |
|------|-------|----------|
| **Page 1** | Dark (#0B1E2F) with cyan accents | Aerial Views, Data Dashboard, Linear Measurements, Customer Preview |
| **Page 2** | Light blue (#E8F4FD) | Primary Roofing Materials, Accessories, Ventilation, Fasteners & Sealants |
| **Page 3** | Light grey-blue (#E0ECF5) | Facet Breakdown, Linear Measurements, Penetrations, SVG Roof Diagram, Summary |

## Pages / Routes
| Route | Description |
|-------|-------------|
| `/` | Marketing landing page (white/blue modern theme) |
| `/login` | Login/register page |
| `/admin` | Admin dashboard (auth required) - Overview, Orders, New Order, Companies, Activity |
| `/order/new` | 5-step order form |
| `/order/:id` | Order confirmation/tracking |
| `/settings` | API keys & config |
| `/customer/login` | Customer login/register portal |
| `/customer/dashboard` | Customer dashboard — 8-tile nav hub with quick stats |
| `/customer/order` | Order a new roof report (address + pay/credit) |
| `/customer/invoice/:id` | View a specific invoice |
| `/customer/reports` | **CRM** — Roof Report History (completed orders) |
| `/customer/customers` | **CRM** — My Customers (add/edit/search/view contacts) |
| `/customer/invoices` | **CRM** — Invoices (create, send, mark paid, line items) |
| `/customer/proposals` | **CRM** — Proposals & Estimates (labor/material/other costs) |
| `/customer/jobs` | **CRM** — Job Management (schedule, checklist, status workflow) |
| `/customer/pipeline` | **CRM** — Sales Pipeline (Coming Soon) |
| `/customer/d2d` | **CRM** — D2D Manager (Coming Soon) |
| `/pricing` | Public pricing page for credit packs |

## CRM Module (v6.0)
Each logged-in customer gets a full roofing business CRM:
- **Customers**: Add/edit/search/delete contacts, track lifetime revenue, view invoices & proposals per client
- **Invoices**: Create with multiple line items, GST calculation, mark as draft/sent/paid/overdue
- **Proposals**: Create roof estimates with labor + material + other costs, mark open/sold
- **Jobs**: Schedule with date/time/crew, checklist (permit, material delivery, dumpster, inspection), start/complete workflow
- **Pipeline**: (Coming Soon) Lead tracking through contact → proposal → closed stages
- **D2D Manager**: (Coming Soon) Territory maps, knock tracking, conversion stats, team management

All CRM data is per-user (owner_id scoped) — each customer manages their own contacts, invoices, proposals, and jobs independently.

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health + env status (includes Gmail OAuth2 status) |
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/users` | List all users |
| GET | `/api/auth/gmail` | Start Gmail OAuth2 authorization (redirects to Google consent) |
| GET | `/api/auth/gmail/callback` | OAuth2 callback (stores refresh token in DB) |
| GET | `/api/auth/gmail/status` | Check Gmail OAuth2 connection status |
| POST | `/api/orders` | Create order |
| GET | `/api/orders` | List orders |
| POST | `/api/reports/:id/generate` | Generate roof report (auto-selects best API: DataLayers > buildingInsights > mock) |
| POST | `/api/reports/:id/generate-enhanced` | Force DataLayers pipeline (GeoTIFF DSM + buildingInsights hybrid) |
| POST | `/api/reports/:id/cloud-ai-analyze` | **NEW** On-demand Cloud Run custom AI analysis (vision + geometry) |
| GET | `/api/reports/cloud-ai/health` | **NEW** Cloud Run AI service health check + deployment status |
| POST | `/api/reports/:id/vision-inspect` | Trigger Gemini vision scan (vulnerabilities/obstructions) |
| GET | `/api/reports/:id/vision` | Get vision findings (filterable by category/severity/confidence) |
| POST | `/api/reports/:id/enhance` | Gemini Pro geometry upgrade (AI facet detection) |
| POST | `/api/reports/datalayers/analyze` | Standalone DataLayers analysis (no order required). Body: `{address}` or `{lat, lng}` |
| GET | `/api/reports/:id/segments` | **NEW** Get all roof segments with exclusion state + overlap flag |
| POST | `/api/reports/:id/toggle-segments` | **NEW** Exclude/include segments and recalculate report. Body: `{excluded_segments: [0,5,7]}` |
| GET | `/api/reports/:id/html` | Get professional HTML report |
| GET | `/api/reports/:id/pdf` | Get PDF-ready HTML with print controls (browser Print → Save as PDF) |
| POST | `/api/reports/:id/email` | Email report (supports `to_email`, `from_email`, `subject_override`) |
| GET | `/api/admin/dashboard` | Admin analytics |
| POST | `/api/admin/init-db` | Initialize/migrate database |

## Gmail OAuth2 Email Delivery (NEW in v4.2)

## Property Overlap Detection & Segment Toggle (NEW in v6.2)

### Why This Exists
Google Solar API's `buildingInsights:findClosest` sometimes returns a merged 3D model that includes a neighboring building, especially for:
- Townhouses / row houses
- Duplexes / semi-detached homes
- Properties with detached garages that share a wall

### How It Works

**1. Precise Coordinate Targeting**
- All API calls now use 7-decimal-place lat/lng (±11mm accuracy)
- `requiredQuality=HIGH` enforced — prefer 404 error over low-quality data
- Forces Google to target the exact building centroid, breaking the link to neighboring houses

**2. Automatic Overlap Detection**
- After receiving the Solar API response, the building's `boundingBox` dimensions are checked
- If width OR depth exceeds 60 ft (≈18.288m), the report is flagged as `Potential Property Overlap`
- Confidence score is automatically reduced (95% → 85%)
- The professional HTML report shows a ⚠️ POTENTIAL OVERLAP badge

**3. Segment Toggle ("Kill Switch")**
- When overlap is detected, the admin can open the **Segment Toggle** modal (layer icon in order actions)
- All `roofSegmentStats` are displayed with toggle switches
- Toggling off a segment immediately recalculates: footprint, true area, pitch, edges, materials, and squares
- The report HTML is regenerated with the excluded segments removed
- API: `POST /api/reports/:id/toggle-segments` with body `{ excluded_segments: [indexA, indexB, ...] }`

**4. Example JSON Response for a Merged Building**
```json
{
  "property_overlap_flag": true,
  "property_overlap_details": [
    "Depth 74 ft (22m) exceeds 60 ft threshold",
    "Width 123 ft (37m) exceeds 60 ft threshold"
  ],
  "segments": [
    { "index": 0, "name": "Segment 1", "footprint_area_sqft": 968, "excluded": false },
    { "index": 1, "name": "Segment 2", "footprint_area_sqft": 732, "excluded": false },
    { "index": 20, "name": "Segment 21", "footprint_area_sqft": 65, "excluded": true },
    { "index": 21, "name": "Segment 22", "footprint_area_sqft": 65, "excluded": true }
  ]
}
```

### Setup Steps (Gmail OAuth2 — from v4.2)
The app uses OAuth2 with a refresh token to send emails as your personal Gmail account. This is the proper method for personal Gmail (domain-wide delegation only works with Google Workspace).

### Setup Steps
1. Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" > "OAuth 2.0 Client ID"
3. Application type: **Web application**
4. Name: "Reuse Canada Roof Reports"
5. Authorized redirect URIs:
   - Local: `http://localhost:3000/api/auth/gmail/callback`
   - Sandbox: `https://3000-{sandbox-id}.sandbox.novita.ai/api/auth/gmail/callback`
   - Production: `https://roofing-measurement-tool.pages.dev/api/auth/gmail/callback`
6. Copy Client ID and Client Secret into `.dev.vars`:
   ```
   GMAIL_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GMAIL_CLIENT_SECRET=your-client-secret
   ```
7. Restart the app
8. Visit `/api/auth/gmail` or click "Connect Gmail" in the admin dashboard
9. Authorize with your Gmail account
10. Refresh token is stored automatically in the database

### Email Provider Priority
1. **Gmail OAuth2** (preferred) - Sends as your personal Gmail (ethangourley17@gmail.com)
2. **Resend API** (alternative) - Set `RESEND_API_KEY` in .dev.vars. Free at https://resend.com
3. **Fallback** - Report HTML available at `/api/reports/:id/html`

### Admin Dashboard
The admin dashboard shows a Gmail connection card:
- **Connected**: Green card with sender email and "Test Email" button
- **Not Connected**: Amber card with setup instructions and "Connect Gmail" button

## Measurement Engine Architecture (v5.0)

### Hybrid DataLayers + buildingInsights Pipeline
The v5.0 engine uses a **hybrid approach** combining the best of both Google Solar APIs:

1. **Geocode** address via Google Maps Geocoding API
2. **Parallel API calls**:
   - `buildingInsights:findClosest` → accurate building footprint area + per-segment pitch data
   - `dataLayers:get` → DSM (Digital Surface Model) GeoTIFF download
3. **GeoTIFF processing** (via geotiff.js — pure JS, Cloudflare Workers compatible):
   - Download DSM + mask GeoTIFFs
   - Parse with geotiff.js → extract elevation raster
   - Apply mask to isolate building pixels
   - Compute slope gradient (central differences: `dz/dx`, `dz/dy`)
   - Calculate pitch: `degrees(arctan(sqrt(dzdx² + dzdy²)))`
4. **Area calculation** (from `execute_roof_order()` template):
   - Flat area from buildingInsights footprint (most accurate building boundary)
   - Pitch from buildingInsights segments (validated against DSM gradient)
   - True 3D area: `flat_area / cos(pitch_rad)`
   - Waste factor: `1.15` if area > 2000 sqft, else `1.05`
   - Pitch multiplier: `sqrt(1 + (pitch_deg/45)²)`
   - Material squares: `true_area × waste_factor × pitch_multiplier / 100`
5. **Report generation**: Professional 3-page HTML with PDF download

### API Priority (auto-fallback)
| Priority | API | Data | Accuracy | Cost |
|----------|-----|------|----------|------|
| 1 | DataLayers + buildingInsights (hybrid) | DSM GeoTIFF + segments | 98.77% | ~$0.15/query |
| 2 | buildingInsights only | Segments + footprint | 95% | ~$0.075/query |
| 3 | Mock data (fallback) | Estimated Alberta profiles | ~70% | $0.00 |

### Coverage
- **Urban/Suburban**: Both APIs return HIGH quality data (0.5m/pixel DSM)
- **Rural/Acreage**: buildingInsights may return 404; DataLayers may still work
- **No coverage**: Fallback to estimated measurements + Gemini AI vision analysis

## Data Architecture
- **Database**: Cloudflare D1 (SQLite)
- **Tables**: admin_users, master_companies, customer_companies, orders, reports, payments, api_requests_log, user_activity_log, settings
- **Storage**: Reports stored as HTML in D1, satellite imagery via Google Maps Static API
- **Gmail Tokens**: Refresh tokens stored in `settings` table (key: `gmail_refresh_token`)

## Tech Stack
- **Backend**: Cloudflare Workers + Hono framework
- **Frontend**: Vanilla JS + Tailwind CSS (CDN)
- **Maps**: Google Maps JS API + Static Maps
- **AI**: Google Solar API DataLayers + buildingInsights (primary) + Gemini 2.0 Flash (secondary/AI analysis) + **Cloud Run Custom AI Model (Colab-trained, dual-path)**
- **Cloud Run**: `https://collab-581996238660.europe-west1.run.app` (GCP: chrome-cascade-487914-e0, europe-west1)
- **GeoTIFF**: geotiff.js (pure JS, Cloudflare Workers compatible) for DSM processing
- **Email**: Gmail OAuth2 (personal Gmail) / Resend API (alternative)
- **Build**: Vite + TypeScript
- **Auth**: Web Crypto API (SHA-256 password hashing)

## Environment Variables
| Key | Description | Required |
|-----|-------------|----------|
| GOOGLE_SOLAR_API_KEY | Google Solar API for building insights | Yes |
| GOOGLE_MAPS_API_KEY | Google Maps (frontend, publishable) | Yes |
| GOOGLE_VERTEX_API_KEY | Gemini REST API key | Yes |
| GOOGLE_CLOUD_PROJECT | GCP project ID | Yes |
| GOOGLE_CLOUD_LOCATION | GCP location | Yes |
| GCP_SERVICE_ACCOUNT_KEY | Full JSON service account key | Yes |
| CLOUD_RUN_AI_URL | Cloud Run custom AI endpoint | Auto (defaults to collab URL) |
| CLOUD_RUN_AI_TOKEN | Cloud Run IAM auth token | Optional |
| GMAIL_CLIENT_ID | OAuth2 Client ID for Gmail | For email |
| GMAIL_CLIENT_SECRET | OAuth2 Client Secret for Gmail | For email |
| GMAIL_REFRESH_TOKEN | OAuth2 refresh token (auto-stored in DB) | Auto |
| GMAIL_SENDER_EMAIL | Gmail address (ethangourley17@gmail.com) | For email |
| RESEND_API_KEY | Resend.com API key (alternative email) | Optional |

## Version History

### v7.0 (Current — Cloud Run Custom AI + Reports Refactor)
- **NEW**: Cloud Run Custom AI Integration (dual-path architecture)
  - PRIMARY: Your Colab-trained model on Cloud Run (`collab-581996238660.europe-west1.run.app`)
  - FALLBACK: Gemini API (active when Cloud Run not yet deployed)
  - Automatic HTML placeholder detection — graceful fallback with zero disruption
  - Vision findings merger: combines Cloud Run + Gemini for maximum coverage
  - Batch multi-image analysis support (satellite + aerial + close-ups)
  - New endpoints: `GET /cloud-ai/health`, `POST /:orderId/cloud-ai-analyze`
- **REFACTORED**: `reports.ts` reduced from 6,996 → 641 lines (thin controller layer)
  - All logic extracted to services/repositories/templates
  - Global error handler with ValidationError support
  - Zod request validation via `src/utils/validation.ts`
- **NEW**: `src/services/cloud-run-ai.ts` — Cloud Run client with response converters
- **NEW**: `src/repositories/reports.ts` — All D1 database queries extracted
- **NEW**: `src/utils/geo-math.ts` — Geospatial utilities with 30 unit tests
- **NEW**: `src/utils/validation.ts` — Zod schemas for request validation
- **EXTRACTED**: `src/services/solar-api.ts`, `report-engine.ts`, `email.ts`
- **EXTRACTED**: `src/templates/svg-diagrams.ts` — All SVG diagram generators
- **STUBBED**: `generateSatelliteOverlaySVG` (returns empty string)

## Cloud Run Custom AI Integration

### Architecture: Dual-Path AI Analysis
```
Report Generation Request
    │
    ├──▶ PATH 1: Cloud Run Custom AI (your Colab-trained model)
    │      ├── POST /api/analyze → vision + geometry
    │      ├── Converts to VisionFindings + AIMeasurementAnalysis
    │      └── GPU-backed inference, unlimited processing time
    │
    ├──▶ PATH 2: Gemini API (automatic fallback)
    │      ├── Gemini 2.0 Flash → vision scan
    │      ├── Gemini 2.5 Pro → geometry analysis
    │      └── 20-30s timeout per request
    │
    └──▶ MERGE: Combine findings for best coverage
           ├── Cloud Run findings take priority (custom-trained)
           ├── Gemini fills gaps for types Cloud Run missed
           └── Spatial de-duplication (bounding box overlap > 30%)
```

### Cloud Run Service Details
- **URL**: `https://collab-581996238660.europe-west1.run.app`
- **GCP Project**: `chrome-cascade-487914-e0`
- **Region**: `europe-west1`
- **Service Name**: `collab`
- **Current Revision**: `collab-00003-q95` (default container — custom model pending deployment)

### API Contract for Your Colab Model
When you deploy your custom model to Cloud Run, it should implement:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check returning JSON: `{status, model_version, gpu_available, capabilities}` |
| `/api/analyze` | POST | Full analysis (vision + geometry) |
| `/api/vision-inspect` | POST | Vision-only inspection |
| `/api/geometry` | POST | Geometry-only analysis |

**Request body**:
```json
{
  "image_urls": ["https://maps.googleapis.com/maps/api/staticmap?..."],
  "analysis_type": "full",
  "coordinates": {"lat": 53.5461, "lng": -113.4938},
  "address": "123 Main St, Edmonton, AB",
  "known_footprint_sqft": 1500,
  "known_pitch_deg": 25,
  "image_meta": {"source": "google_maps_satellite", "zoom_level": 20, "resolution_px": 640}
}
```

**Expected response**:
```json
{
  "success": true,
  "model_version": "reuse-canada-roof-v1.0",
  "inference_time_ms": 2500,
  "vision": {
    "findings": [{"category": "vulnerability", "type": "missing_shingles", "severity": "high", "confidence": 85, ...}],
    "overall_condition": "fair",
    "summary": "Aging roof with visible wear patterns"
  },
  "geometry": {
    "facets": [{"id": "F1", "points": [{"x": 100, "y": 200}, ...], "pitch_deg": 25, "azimuth_deg": 180}],
    "lines": [{"type": "RIDGE", "start": {"x": 100, "y": 200}, "end": {"x": 300, "y": 200}}],
    "overall_quality_score": 80
  }
}
```

### v5.0
- **Added**: Solar DataLayers API integration with GeoTIFF DSM processing
  - Hybrid pipeline: buildingInsights (footprint) + DataLayers DSM (slope/pitch)
  - GeoTIFF parsing via geotiff.js (pure JS, Cloudflare Workers compatible)
  - DSM gradient analysis for precise slope/pitch measurement
  - Area formulas from `execute_roof_order()` template:
    - `true_area = flat_area / cos(pitch_rad)`
    - `waste_factor = 1.15 if area > 2000 sqft else 1.05`
    - `pitch_multiplier = sqrt(1 + (pitch_deg/45)^2)`
- **Added**: `POST /api/reports/:id/generate-enhanced` — Force DataLayers pipeline
- **Added**: `POST /api/reports/datalayers/analyze` — Standalone analysis endpoint
- **Added**: `GET /api/reports/:id/pdf` — PDF download with print controls
- **Updated**: Main `/generate` endpoint now tries DataLayers first, falls back to buildingInsights, then mock
- **Updated**: Report version 3.0 when DataLayers used (2.0 for buildingInsights)
- **Improved**: Mask resampling for different DSM/mask resolutions
- **Improved**: Height-based roof detection when mask is unavailable

### v4.2
- **Added**: Gmail OAuth2 integration for personal Gmail email delivery
  - OAuth2 consent flow at `/api/auth/gmail`
  - Callback handler stores refresh token in D1 database
  - Status endpoint at `/api/auth/gmail/status`
  - Email sender uses refresh token to get access tokens
  - Checks both env vars and DB for stored refresh tokens
- **Added**: Gmail connection card in admin dashboard
  - Shows connection status (connected/not connected)
  - "Connect Gmail" button for one-click authorization
  - "Test Email" button when connected
  - Step-by-step setup instructions when not configured
- **Updated**: Health check shows Gmail OAuth2 configuration status
- **Updated**: Email provider priority: Gmail OAuth2 > Resend > Fallback

### v4.1
- Removed RAS yield computation from report generation pipeline
- Fixed Gmail API error handling for personal Gmail accounts
- Added Resend API as recommended email provider
- Improved Google Solar API handling for rural/acreage properties

### v4.0
- Theme: Green to modern white/blue palette
- Removed: AI Measure button, "Powered by Google Solar AI" branding
- Added: Login/register page, auth system, admin auth guard
- Added: New Order tab in admin, email report button

## Project Structure (v7.0)
```
src/
├── index.tsx                    # Main Hono app entry (routes + health)
├── types.ts                     # All TypeScript types + Bindings
├── routes/
│   ├── reports.ts               # 641 lines — thin controller layer
│   ├── admin.ts, auth.ts, crm.ts, ...
├── services/
│   ├── cloud-run-ai.ts          # ★ Cloud Run custom AI client
│   ├── vision-analyzer.ts       # Gemini vision inspection
│   ├── gemini.ts                # Gemini geometry analysis
│   ├── solar-api.ts             # Google Solar API + mock data
│   ├── report-engine.ts         # DataLayers report builder
│   ├── solar-datalayers.ts      # GeoTIFF DSM processing
│   ├── email.ts                 # Gmail OAuth2 + Resend
│   └── gcp-auth.ts              # GCP token management
├── repositories/
│   └── reports.ts               # All D1 database queries
├── templates/
│   ├── report-html.ts           # Professional 3-page HTML
│   └── svg-diagrams.ts          # All SVG diagram generators
└── utils/
    ├── geo-math.ts              # Geospatial utilities
    ├── geo-math.test.ts         # 30 unit tests
    └── validation.ts            # Zod request schemas
```

## Next Steps
1. **Deploy Colab Model to Cloud Run**: Push your trained model to the linked repo → automatic deployment
2. **Gmail Setup**: Create OAuth2 credentials in GCP Console, visit `/api/auth/gmail` to authorize
3. **Sales Pipeline**: Implement Kanban-style lead tracking (Lead → Contact → Proposal → Closed)
4. **D2D Manager**: Territory maps, knock tracking, conversion stats, team management
5. **Real PDF Generation**: Integrate Cloudflare Browser Rendering or Gotenberg for true PDF export
6. **Cloudflare Queues**: Replace `waitUntil()` with Queues for heavy Gemini AI tasks

## Deployment
- **Platform**: Cloudflare Pages (via Wrangler)
- **Production**: https://roofing-measurement-tool.pages.dev
- **Cloud Run AI**: https://collab-581996238660.europe-west1.run.app
- **GitHub**: https://github.com/ethan8585g/Roofreportai
- **Status**: ✅ Active (Cloudflare Pages + Cloud Run AI)
- **Last Updated**: 2026-03-08
- **Build**: `npm run build` (Vite SSR)
