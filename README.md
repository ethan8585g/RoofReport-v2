# Reuse Canada - Professional Roof Measurement Reports

## Project Overview
- **Name**: Reuse Canada Roof Measurement Reports
- **Version**: 4.0 (Login/Register, White/Blue Theme, No RAS, Enhanced Admin)
- **Goal**: Professional roof measurement reports for roofing contractors installing new roofs
- **Features**: Marketing landing page, login/register system, admin dashboard with order management, Google Solar API, Material BOM, Edge Analysis, Gmail API Email Delivery

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
6. Reports are generated via Google Solar API or Gemini AI fallback
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
| POST | `/api/reports/:id/email` | Email report to recipient |
| GET | `/api/admin/dashboard` | Admin analytics |
| POST | `/api/admin/init-db` | Initialize/migrate database |

## Data Architecture
- **Database**: Cloudflare D1 (SQLite)
- **Tables**: admin_users, master_companies, customer_companies, orders, reports, payments, api_requests_log, user_activity_log, settings
- **Storage**: Reports stored as HTML in D1, satellite imagery via Google Maps Static API

## Tech Stack
- **Backend**: Cloudflare Workers + Hono framework
- **Frontend**: Vanilla JS + Tailwind CSS (CDN)
- **Maps**: Google Maps JS API + Static Maps
- **AI**: Google Solar API + Gemini 2.0 Flash (fallback)
- **Build**: Vite + TypeScript
- **Auth**: Web Crypto API (SHA-256 password hashing)

## v4.0 Changes
- **Theme**: Green to modern white/blue palette
- **Removed**: AI Measure button, "Powered by Google Solar AI" branding
- **Removed**: All RAS (Recycled Asphalt Shingle) content from reports
- **Added**: Login/register page at /login
- **Added**: Auth system with password hashing
- **Added**: Admin auth guard (redirects to login if not authenticated)
- **Added**: New Order tab in admin (create orders + auto-generate reports)
- **Added**: Email report button in admin orders
- **Fixed**: Mock roof area range (1100-1800 sqft footprint, was 1400-2800)
- **Note**: Gmail API enabled but needs domain-wide delegation for service account

## Gmail Email Delivery
- Gmail API enabled in GCP project 191664638800
- Service account: roof-measure-ai@helpful-passage-486204-h9.iam.gserviceaccount.com
- **Action required**: Configure domain-wide delegation with `gmail.send` scope
- Fallback: Report HTML available at `/api/reports/:id/html`

## Environment Variables
| Key | Description |
|-----|-------------|
| GOOGLE_SOLAR_API_KEY | Google Solar API for building insights |
| GOOGLE_MAPS_API_KEY | Google Maps (frontend, publishable) |
| GOOGLE_VERTEX_API_KEY | Gemini REST API key |
| GOOGLE_CLOUD_PROJECT | GCP project ID |
| GOOGLE_CLOUD_LOCATION | GCP location |
| GCP_SERVICE_ACCOUNT_KEY | Full JSON service account key |

## Deployment
- **Platform**: Cloudflare Pages (via Wrangler)
- **Status**: Active (Sandbox)
- **Last Updated**: 2026-02-11
- **Build**: `npm run build` (Vite SSR)
