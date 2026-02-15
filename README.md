# Reuse Canada - Professional Roof Measurement Reports

## Project Overview
- **Name**: Reuse Canada Roof Measurement Reports
- **Version**: 5.0 (Solar DataLayers + GeoTIFF DSM Engine)
- **Goal**: Professional roof measurement reports for roofing contractors installing new roofs
- **Features**: Marketing landing page, login/register system, admin dashboard with order management, Google Solar API, **Solar DataLayers GeoTIFF processing**, Material BOM, Edge Analysis, Gmail OAuth2 Email Delivery, PDF download

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
| POST | `/api/reports/datalayers/analyze` | Standalone DataLayers analysis (no order required). Body: `{address}` or `{lat, lng}` |
| GET | `/api/reports/:id/html` | Get professional HTML report |
| GET | `/api/reports/:id/pdf` | Get PDF-ready HTML with print controls (browser Print → Save as PDF) |
| POST | `/api/reports/:id/email` | Email report (supports `to_email`, `from_email`, `subject_override`) |
| GET | `/api/admin/dashboard` | Admin analytics |
| POST | `/api/admin/init-db` | Initialize/migrate database |

## Gmail OAuth2 Email Delivery (NEW in v4.2)

### How It Works
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
- **AI**: Google Solar API DataLayers + buildingInsights (primary) + Gemini 2.0 Flash (secondary/AI analysis)
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
| GMAIL_CLIENT_ID | OAuth2 Client ID for Gmail | For email |
| GMAIL_CLIENT_SECRET | OAuth2 Client Secret for Gmail | For email |
| GMAIL_REFRESH_TOKEN | OAuth2 refresh token (auto-stored in DB) | Auto |
| GMAIL_SENDER_EMAIL | Gmail address (ethangourley17@gmail.com) | For email |
| RESEND_API_KEY | Resend.com API key (alternative email) | Optional |

## Version History

### v5.0 (Current)
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

## Next Steps
1. **Gmail Setup**: Create OAuth2 credentials in GCP Console, visit `/api/auth/gmail` to authorize
2. **Measurements**: For rural properties without API coverage, use Gemini AI vision analysis
3. **Stripe Payments**: Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY
4. **Cloudflare Deploy**: Deploy to production with `npx wrangler pages deploy dist`
5. **Email Report PDF**: Enhance email endpoint to auto-trigger DataLayers generation + email

## Deployment
- **Platform**: Cloudflare Pages (via Wrangler)
- **Status**: Active (Sandbox)
- **Last Updated**: 2026-02-14
- **Build**: `npm run build` (Vite SSR)
