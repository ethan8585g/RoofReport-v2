# Roof Measurement Tool - Reuse Canada

## Project Overview
- **Name**: Roofing Measurement Tool
- **Operator**: Reuse Canada
- **Goal**: Professional roof measurement report ordering system with tiered pricing, Google Solar API integration, and B2B customer management
- **Stack**: Hono + TypeScript + Cloudflare Pages + D1 Database + Tailwind CSS

## Live URLs
- **Order Form**: `/` - Multi-step order form for requesting roof measurements
- **Admin Dashboard**: `/admin` - Order queue, revenue stats, customer management
- **Settings**: `/settings` - API keys, company profile, pricing configuration
- **Order Confirmation**: `/order/:id` - Order details and report data

## Features (Completed)

### 1. Multi-Step Order Form (5 steps)
- **Step 1**: Service tier selection (Immediate $25 / Urgent $15 / Regular $10)
- **Step 2**: Property location with address search + Google Maps pin-drop (with OpenStreetMap fallback)
- **Step 3**: Homeowner information (name, phone, email)
- **Step 4**: Requester / company identification (with B2B customer selector)
- **Step 5**: Review & submit with full order summary

### 2. Service Tiers & Pricing
| Tier | Price | Delivery Time | Description |
|------|-------|---------------|-------------|
| Immediate | $25 CAD | Under 5 min | Priority processing |
| Urgent | $15 CAD | 15-30 min | Fast-tracked report |
| Regular | $10 CAD | 45 min - 1.5 hr | Standard processing |

### 3. Company Identification
- **Master Company**: Reuse Canada operator profile
- **Customer Companies**: B2B client management (add/edit/list)
- Auto-fill requester details when selecting an existing customer

### 4. Google Maps Integration
- Interactive satellite map with click-to-pin
- Address search with geocoding
- Latitude/longitude capture for precise roof identification
- OpenStreetMap fallback when Google Maps API is not configured

### 5. Admin Dashboard
- Real-time order statistics (total, pending, processing, completed)
- Revenue breakdown by service tier
- Recent orders table with status management
- Customer company management with inline add form
- Activity log for audit trail

### 6. Settings Panel
- Master company profile editor
- API key management (Google Solar, Google Maps, Stripe)
- Pricing configuration per tier
- Keys are masked after saving for security

### 7. Order Confirmation & Report
- Full order summary with progress tracking
- Roof measurement data display (area, pitch, azimuth, solar potential)
- Print-friendly layout

### 8. Backend API
Full REST API for all operations:
- `POST /api/orders` - Create order
- `GET /api/orders` - List orders (filterable)
- `GET /api/orders/:id` - Get order details
- `PATCH /api/orders/:id/status` - Update status
- `POST /api/orders/:id/pay` - Process payment
- `POST /api/reports/:orderId/generate` - Generate measurement report
- `GET /api/reports/:orderId` - Get report data
- `GET /api/companies/master` - Get master company
- `PUT /api/companies/master` - Update master company
- `GET /api/companies/customers` - List customer companies
- `POST /api/companies/customers` - Add customer company
- `GET /api/settings` - List settings
- `PUT /api/settings/:key` - Save setting
- `GET /api/admin/dashboard` - Dashboard stats
- `POST /api/admin/init-db` - Initialize database

## Data Architecture

### Database: Cloudflare D1 (SQLite)
- `master_companies` - Operator business profile
- `customer_companies` - B2B client companies
- `orders` - Roof measurement requests
- `reports` - Generated measurement reports
- `payments` - Payment transaction records
- `settings` - API keys and configuration
- `api_requests_log` - API call audit trail
- `user_activity_log` - User action tracking

## What Still Needs API Keys

### Google Solar API
- Required for real roof measurement data
- Currently using mock data that simulates the API response
- Get key: https://console.cloud.google.com/apis/library/solar.googleapis.com

### Google Maps API
- Required for interactive satellite map + geocoding
- Fallback to OpenStreetMap + manual coordinate entry works without it
- Get key: https://console.cloud.google.com/apis/library/maps-backend.googleapis.com

### Stripe (Payment Processing)
- Currently using simulated payment flow
- Need real Stripe keys for production payments
- Get keys: https://dashboard.stripe.com/apikeys

## Next Phase (Not Yet Implemented)

1. **Real Google Solar API Integration** - Replace mock data with live API calls
2. **Stripe Payment Processing** - Real checkout flow with payment intents
3. **PDF Report Generation** - Branded PDF reports with roof imagery
4. **Email Notifications** - Send reports to homeowners/requesters
5. **Customer Login/Dashboard** - Authentication and order history
6. **Webhook Processing** - Stripe payment confirmations
7. **Rate Limiting** - Protect API endpoints
8. **Production Deployment** - Deploy to Cloudflare Pages

## Deployment
- **Platform**: Cloudflare Pages + D1 Database
- **Status**: Development (running locally)
- **Tech Stack**: Hono 4.x + TypeScript + Tailwind CSS (CDN) + Font Awesome
- **Last Updated**: 2026-02-09
