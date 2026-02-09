# Reuse Canada - Roof Measurement Tool v2.0

Professional satellite-based roof measurement platform with 3D surface area calculation, edge-level analysis, and automated material estimation (Bill of Materials).

## Live App

- **Sandbox**: https://3000-ing8ae0z5fkhj91kq4pyi-dfc00ec5.sandbox.novita.ai
- **Order Form**: `/`
- **Admin Dashboard**: `/admin`
- **Settings**: `/settings`
- **Order Confirmation**: `/order/:id`
- **Professional Report (PDF-ready)**: `/api/reports/:id/html`

## Completed Features (v2.0)

### Core Measurement Engine
- **3D Surface Area Calculation**: `true_area = footprint / cos(pitch)` applied per-segment
- **Edge-Level 3D Math**: Hip/valley factor `sqrt(2*rise^2 + 288) / (12*sqrt(2))`; rake factor `1 / cos(pitch)`
- **Weighted Pitch Averaging**: Area-weighted across all segments
- **Google Solar API Integration**: `buildingInsights:findClosest` with `roofSegmentStats` parsing (pitchDegrees, azimuthDegrees, stats.areaMeters2, planeHeightAtCenterMeters)
- **Mock Data Generator**: Realistic Alberta residential data when API key not configured

### Edge Measurement System
Every report includes 3D linear measurements for all roof edges:
| Edge Type | Plan vs True | Calculation |
|-----------|-------------|-------------|
| Ridge | Horizontal (plan = true) | Ridge lines are level |
| Hip | plan * hip_factor | `sqrt(2*rise^2 + 288) / (12*sqrt(2))` |
| Valley | plan * valley_factor | Same as hip factor |
| Eave | Horizontal (plan = true) | Bottom perimeter |
| Rake | plan * rake_factor | `1 / cos(pitch)` |

### Material Estimation Engine (BOM)
Automated Bill of Materials with 9 line items:
1. **Shingles** (architectural/3-tab) - 3 bundles per square
2. **Underlayment** (synthetic) - 1 roll per 1000 sqft
3. **Ice & Water Shield** - eave + valley coverage, 3 ft wide
4. **Starter Strip** - eave + rake linear footage
5. **Ridge/Hip Cap** - ridge + hip linear footage
6. **Drip Edge** (aluminum) - eave + rake, 10 ft sections
7. **Valley Flashing** (W-valley) - valley linear footage
8. **Roofing Nails** - 1.5 lbs per square, 30 lb boxes
9. **Ridge Vent** - 4 ft sections along ridge

**Waste Calculation**: 10% (simple) to 15% (very complex), based on:
- Segment count
- Hip/valley count
- Pitch variation across segments

**Complexity Classification**: simple / moderate / complex / very_complex

### Professional Report (6 Sections)
Accessible at `/api/reports/:id/html` - branded, print-ready, PDF-convertible:
1. **Property Context** - address, coordinates, homeowner/requester
2. **Measurement Summary** - footprint vs true area, pitch multiplier
3. **Edge Breakdown** - all edges with plan vs 3D lengths and factors
4. **Facet Analysis** - per-segment footprint, true area, pitch, direction
5. **Material Estimates** - full BOM with quantities, waste, pricing
6. **Solar Potential** - panels, energy, sunshine hours

### Order & Payment Pipeline
- 5-step order form: Service Tier > Property > Homeowner > Requester > Review
- 3 service tiers: Immediate ($25, 5 min), Urgent ($15, 30 min), Regular ($10, 1.5 hr)
- Simulated payment processing with audit trail
- Auto-generate report on payment

### Admin Dashboard
- Order statistics (total, pending, processing, completed)
- Revenue breakdown by tier
- Report & material statistics (avg squares, avg cost, complexity breakdown)
- Company management (add/edit B2B customers)
- Activity log

### Settings
- Company profile (Reuse Canada identity)
- API key status display (env var based, never in DB)
- Pricing configuration per tier

## API Reference

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/orders` | Create order |
| GET | `/api/orders` | List orders (filters: status, tier, limit, offset) |
| GET | `/api/orders/:id` | Get order + report summary |
| PATCH | `/api/orders/:id/status` | Update status |
| POST | `/api/orders/:id/pay` | Process payment |

### Reports
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/reports/:id` | Get full report data |
| POST | `/api/reports/:id/generate` | Generate v2.0 report (with edges + materials) |
| GET | `/api/reports/:id/html` | Professional HTML report (PDF-ready) |

### Companies
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/companies/master` | Get master company (Reuse Canada) |
| PUT | `/api/companies/master` | Update master company |
| GET | `/api/companies/customers` | List B2B customers |
| POST | `/api/companies/customers` | Add customer company |

### System
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check + env var status |
| GET | `/api/config/client` | Frontend-safe publishable keys |
| GET | `/api/admin/dashboard` | Dashboard stats + report stats |

## Data Architecture

### Canonical Data Model (`src/types.ts`)
```
RoofReport {
  property: { address, city, province, lat, lng, homeowner, requester }
  total_footprint_sqft, total_true_area_sqft, area_multiplier
  roof_pitch_degrees, roof_pitch_ratio, roof_azimuth_degrees
  segments: RoofSegment[] { name, footprint, true_area, pitch, azimuth }
  edges: EdgeMeasurement[] { type, label, plan_length, true_length, pitch_factor }
  edge_summary: { ridge_ft, hip_ft, valley_ft, eave_ft, rake_ft, total_ft }
  materials: MaterialEstimate {
    net_area, waste_pct, gross_area, gross_squares, bundle_count
    line_items: MaterialLineItem[] { category, description, net/gross/order qty, price }
    total_material_cost_cad, complexity_class, complexity_factor
  }
  quality: { imagery_quality, confidence_score, field_verification_recommended, notes }
  metadata: { provider, api_duration_ms, coordinates }
}
```

### Database (Cloudflare D1)
- **8 tables**: master_companies, customer_companies, orders, reports, payments, api_requests_log, user_activity_log, settings
- **3 migrations**: initial schema, 3D area fields, edges/materials/quality fields
- Reports table stores: segments JSON, edges JSON, material estimate JSON, plus denormalized fields for fast queries

### Security Architecture
- API keys stored in environment variables only (`.dev.vars` local, `wrangler secret` prod)
- Never in database, never in frontend JS
- `GOOGLE_SOLAR_API_KEY` and `STRIPE_SECRET_KEY` = server-side only
- `GOOGLE_MAPS_API_KEY` injected server-side into HTML script tag (referrer-restricted)
- `STRIPE_PUBLISHABLE_KEY` exposed to frontend (by design)
- `/api/health` reports configured status (true/false), never values

## Tech Stack
- **Backend**: Hono (TypeScript) on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla JS + Tailwind CSS (CDN)
- **Build**: Vite + @hono/vite-build
- **Dev**: wrangler pages dev --d1 --local

## API Keys Required for Production
1. **Google Solar API** - https://console.cloud.google.com/apis/library/solar.googleapis.com
2. **Google Maps API** - https://console.cloud.google.com/apis/library/maps-backend.googleapis.com
3. **Stripe** - https://dashboard.stripe.com/apikeys

## What's Next
- [ ] Live Google Solar API data (add key to `.dev.vars`)
- [ ] Stripe checkout integration (real payments)
- [ ] Email notifications (report delivery)
- [ ] Customer portal (self-service access)
- [ ] Cloudflare Pages deployment
- [ ] Terra Draw integration (replacing deprecated Google Drawing Library)
- [ ] GeoTIFF processing (DSM/Mask layers)
- [ ] SRS SIPS material ordering integration

## Last Updated
2026-02-09 - v2.0 release
