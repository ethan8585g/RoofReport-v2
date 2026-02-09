# Roof Measurement Tool - Reuse Canada

## Project Overview
- **Name**: Roofing Measurement Tool
- **Operator**: Reuse Canada
- **Goal**: Professional roof measurement report ordering system with 3D surface area calculations, tiered pricing, and Google Solar API integration
- **Stack**: Hono + TypeScript + Cloudflare Pages + D1 Database + Tailwind CSS

## Live URLs
- **Order Form**: `/` - Multi-step order form for requesting roof measurements
- **Admin Dashboard**: `/admin` - Order queue, revenue stats, customer management
- **Settings**: `/settings` - API key status, company profile, pricing configuration
- **Order Confirmation**: `/order/:id` - Order details with 3D roof measurement report

## Security Architecture

### API Key Storage (Environment Variables Only)
```
API keys are NEVER stored in the database or exposed to frontend JavaScript.

Local development:  .dev.vars file (git-ignored)
Production:         wrangler pages secret put <KEY_NAME>

Key               | Where Used      | Exposed to Frontend?
------------------|-----------------|---------------------
GOOGLE_SOLAR_API  | Server-side only| NO - never
GOOGLE_MAPS_API   | Server-side SSR | Injected into HTML <script> tag (referrer-restricted)
STRIPE_SECRET     | Server-side only| NO - never
STRIPE_PUBLISHABLE| /api/config     | YES - designed to be public by Stripe
```

### Endpoints
- `GET /api/health` - Shows which env vars are configured (true/false, never values)
- `GET /api/config/client` - Returns ONLY publishable keys for frontend use

## 3D Roof Math

**The critical distinction this tool makes:**

Standard AI code measures the flat "footprint" of a roof — what you see from a satellite looking straight down. But roofs are slanted. The actual surface area a roofer needs to cover with shingles is LARGER than the footprint.

**Formula**: `true_surface_area = footprint / cos(pitch_in_radians)`

| Pitch (degrees) | Pitch (ratio) | Multiplier | 1000 sqft footprint = |
|------------------|---------------|------------|----------------------|
| 15               | 3.2:12        | 1.035x     | 1,035 sqft true area |
| 22               | 4.8:12        | 1.079x     | 1,079 sqft true area |
| 27               | 6.1:12        | 1.122x     | 1,122 sqft true area |
| 34               | 8.1:12        | 1.206x     | 1,206 sqft true area |
| 45               | 12:12         | 1.414x     | 1,414 sqft true area |

Every report includes:
- `total_footprint_sqft` - Flat 2D area from above
- `total_true_area_sqft` - Actual 3D surface area (what matters for materials)
- `area_multiplier` - How much bigger the real roof is
- Per-segment breakdown with both footprint and true area

## Features (Completed)

### 1. Multi-Step Order Form (5 steps)
- Step 1: Service tier selection (Immediate $25 / Urgent $15 / Regular $10)
- Step 2: Property location with address search + Google Maps pin-drop (OpenStreetMap fallback)
- Step 3: Homeowner information
- Step 4: Requester / company identification with B2B customer selector
- Step 5: Review & submit

### 2. Service Tiers
| Tier | Price | Delivery | Description |
|------|-------|----------|-------------|
| Immediate | $25 CAD | Under 5 min | Priority processing |
| Urgent | $15 CAD | 15-30 min | Fast-tracked |
| Regular | $10 CAD | 45 min-1.5hr | Standard |

### 3. Admin Dashboard
- Real-time order statistics and revenue breakdown
- Order management table
- Customer company CRUD
- Activity audit log

### 4. Settings Panel
- Master company profile editor
- API key status display (env var based — not editable from UI)
- Pricing configuration

### 5. Report Data Model (TypeScript Interface)
```typescript
interface RoofReport {
  total_footprint_sqft: number    // Flat 2D view from above
  total_true_area_sqft: number    // Actual 3D surface (shingle area)
  area_multiplier: number         // true / footprint ratio
  roof_pitch_degrees: number      // Dominant pitch angle
  roof_pitch_ratio: string        // "6.2:12" format
  segments: RoofSegment[]         // Per-face breakdown
  max_sunshine_hours: number      // Annual solar hours
  num_panels_possible: number     // Solar panel capacity
  yearly_energy_kwh: number       // Estimated annual energy
}
```

## API Endpoints
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Service status + env var config check |
| GET | /api/config/client | Safe publishable keys for frontend |
| POST | /api/orders | Create order |
| GET | /api/orders | List orders (filterable) |
| GET | /api/orders/:id | Get order + report details |
| POST | /api/orders/:id/pay | Process payment |
| POST | /api/reports/:id/generate | Generate 3D measurement report |
| GET | /api/reports/:id | Get report data |
| GET | /api/companies/master | Get operator company |
| PUT | /api/companies/master | Update operator company |
| GET | /api/companies/customers | List B2B customers |
| POST | /api/companies/customers | Add customer |
| GET | /api/settings | List non-sensitive settings |
| PUT | /api/settings/:key | Save setting |
| GET | /api/admin/dashboard | Dashboard stats |

## Database: Cloudflare D1
8 tables: master_companies, customer_companies, orders, reports, payments, settings, api_requests_log, user_activity_log

## Setup

### Local Development
```bash
# 1. Clone and install
npm install

# 2. Add your API keys to .dev.vars
cp .dev.vars.example .dev.vars  # Edit with your keys

# 3. Build + migrate + seed + run
npm run build
npm run db:migrate:local
npm run db:seed
npm run dev:sandbox
```

### Production Deployment
```bash
# 1. Set secrets
npx wrangler pages secret put GOOGLE_SOLAR_API_KEY
npx wrangler pages secret put GOOGLE_MAPS_API_KEY
npx wrangler pages secret put STRIPE_SECRET_KEY
npx wrangler pages secret put STRIPE_PUBLISHABLE_KEY

# 2. Deploy
npm run deploy:prod
```

## What Still Needs API Keys

| Feature | Key Required | Current Behavior |
|---------|-------------|-----------------|
| Real roof measurements | GOOGLE_SOLAR_API_KEY | Mock data with correct 3D math |
| Interactive satellite map | GOOGLE_MAPS_API_KEY | OpenStreetMap fallback |
| Payment processing | STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY | Simulated payment flow |

## Next Phase
1. Real Google Solar API integration (just add the key)
2. Stripe payment processing (just add the keys)
3. PDF report generation
4. Email notifications
5. Customer login/dashboard
6. Production deployment to Cloudflare Pages

## Deployment
- **Platform**: Cloudflare Pages + D1 Database
- **Status**: Development
- **Last Updated**: 2026-02-09
