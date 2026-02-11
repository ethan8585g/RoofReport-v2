# Reuse Canada - Professional Roof Measurement Reports

## Project Overview
- **Name**: Reuse Canada Roof Measurement Reports
- **Version**: 4.1 (RAS Pipeline Removed, Email Provider Fix, Rural Property Handling)
- **Goal**: Professional roof measurement reports for roofing contractors installing new roofs
- **Features**: Marketing landing page, login/register system, admin dashboard with order management, Google Solar API, Material BOM, Edge Analysis, Multi-Provider Email Delivery

## URLs
- **Live Sandbox**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai
- **Login/Register**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/login
- **Admin Dashboard**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/admin
- **Health Check**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/api/health
- **Example Report (Order 17)**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai/api/reports/17/html

## User Flow
1. Visitor lands on marketing page (/) with modern white/blue theme
2. Clicks "Order Report" or "Login" -> redirected to /login
3. Creates account or signs in
4. Redirected to /admin dashboard
5. Can order reports, view orders, track sales, manage companies
6. Reports are generated via Google Solar API (urban) or estimated data (rural)
7. Professional 3-page PDF-ready HTML reports delivered via email

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

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health + env status |
| POST | `/api/auth/register` | Create new account |
| POST | `/api/auth/login` | Sign in |
| GET | `/api/auth/users` | List all users |
| POST | `/api/orders` | Create order |
| GET | `/api/orders` | List orders |
| POST | `/api/reports/:id/generate` | Generate roof report |
| GET | `/api/reports/:id/html` | Get professional HTML report |
| POST | `/api/reports/:id/email` | Email report (supports `to_email`, `from_email`, `subject_override`) |
| GET | `/api/admin/dashboard` | Admin analytics |
| POST | `/api/admin/init-db` | Initialize/migrate database |

## Google Solar API Status
- **Urban/Suburban**: Google Solar API returns **real building data** (HIGH quality, 0.1m/pixel)
  - Tested: Edmonton downtown returns 92 segments, HIGH imagery from 2021
  - Cost: ~$0.075 per query
- **Rural/Acreage**: Google Solar API returns **404 NOT_FOUND** (no building model)
  - 51046 Range Road 224 (Strathcona County) = rural, not in Google coverage
  - Fallback: estimated measurements based on typical Alberta residential profiles
  - Report clearly labeled: "estimated (location not in Google Solar coverage)"
  - Recommendation: field verification or aerial drone survey for precise measurements

## Email Delivery
Email provider priority:
1. **Resend API** (recommended) - Set `RESEND_API_KEY` in .dev.vars. Free at https://resend.com (100 emails/day)
2. **Gmail API** via Service Account - Requires Google Workspace with domain-wide delegation
3. **Fallback** - Report HTML available at `/api/reports/:id/html`

### Gmail API Issue (Personal Gmail)
- Personal Gmail (@gmail.com) does **NOT** support domain-wide delegation
- Service account cannot impersonate personal Gmail users
- Solution: Use Resend API (or any transactional email service)
- For Google Workspace users: configure domain-wide delegation in Admin Console

## Data Architecture
- **Database**: Cloudflare D1 (SQLite)
- **Tables**: admin_users, master_companies, customer_companies, orders, reports, payments, api_requests_log, user_activity_log, settings
- **Storage**: Reports stored as HTML in D1, satellite imagery via Google Maps Static API

## Tech Stack
- **Backend**: Cloudflare Workers + Hono framework
- **Frontend**: Vanilla JS + Tailwind CSS (CDN)
- **Maps**: Google Maps JS API + Static Maps
- **AI**: Google Solar API (primary) + Gemini 2.0 Flash (secondary/AI analysis)
- **Build**: Vite + TypeScript
- **Auth**: Web Crypto API (SHA-256 password hashing)

## Environment Variables
| Key | Description |
|-----|-------------|
| GOOGLE_SOLAR_API_KEY | Google Solar API for building insights |
| GOOGLE_MAPS_API_KEY | Google Maps (frontend, publishable) |
| GOOGLE_VERTEX_API_KEY | Gemini REST API key |
| GOOGLE_CLOUD_PROJECT | GCP project ID |
| GOOGLE_CLOUD_LOCATION | GCP location |
| GCP_SERVICE_ACCOUNT_KEY | Full JSON service account key |
| GMAIL_SENDER_EMAIL | Email to impersonate for Gmail API (Workspace only) |
| RESEND_API_KEY | Resend.com API key (recommended for email) |

## v4.1 Changes (Current)
- **Removed**: RAS yield computation from report generation pipeline (was still being computed)
- **Fixed**: Gmail API error handling - clear message that personal Gmail doesn't support delegation
- **Added**: Resend API as recommended email provider for personal Gmail users
- **Improved**: Google Solar API error handling for rural/acreage properties
  - 404 now shows "estimated (location not in Google Solar coverage)"
  - Quality notes explain rural property limitations
  - Recommends field verification for precise measurements
- **Added**: GMAIL_SENDER_EMAIL and RESEND_API_KEY env vars
- **Added**: Email provider priority: Resend > Gmail API > Fallback URL

## v4.0 Changes
- Theme: Green to modern white/blue palette
- Removed: AI Measure button, "Powered by Google Solar AI" branding
- Removed: All RAS content from report HTML output
- Added: Login/register page, auth system, admin auth guard
- Added: New Order tab in admin, email report button
- Fixed: Mock roof area range (1100-1800 sqft footprint)

## Next Steps
1. **Email Delivery**: Sign up at https://resend.com, get API key, set RESEND_API_KEY in .dev.vars
2. **Measurements**: For rural properties, integrate aerial drone imagery or manual input for precise area
3. **Stripe Payments**: Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY for payment processing
4. **Cloudflare Deploy**: Deploy to production with `npx wrangler pages deploy dist`

## Deployment
- **Platform**: Cloudflare Pages (via Wrangler)
- **Status**: Active (Sandbox)
- **Last Updated**: 2026-02-11
- **Build**: `npm run build` (Vite SSR)
