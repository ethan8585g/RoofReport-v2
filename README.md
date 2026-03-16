# RoofReporterAI — Professional Roof Measurement & Sales Platform

## Project Overview
- **Name**: RoofReporterAI
- **Version**: 9.0 (Secretary AI Phone Onboarding + 3D Visualizer + Tiered Proposals)
- **Domain**: www.roofreporterai.com
- **Production**: https://roofing-measurement-tool.pages.dev
- **GitHub**: https://github.com/ethan8585g/roofreporter-ai-good-copy
- **Platform**: Cloudflare Pages + Workers + D1
- **Status**: Active
- **Last Updated**: 2026-03-16

## Core Platform Features

### 1. Roof Measurement Reports
- Google Solar API (DataLayers + buildingInsights hybrid)
- GeoTIFF DSM processing for precise slope/pitch
- Professional 3-page HTML reports (dark/light/blueprint themes)
- Satellite imagery, edge breakdown, material BOM
- AI-enhanced reports via Gemini 2.0 Flash

### 2. 3-Tier Good/Better/Best Proposals
- **Good** — 25yr 3-Tab Shingles ($110/sq shingles, $160/sq labor)
- **Better** — 30yr Architectural ($145/sq, $180/sq labor) *Most Popular*
- **Best** — 50yr Luxury/Designer ($225/sq, $210/sq labor)
- Side-by-side comparison page at `/proposal/compare/:groupId`
- Customer signature pad, accept/decline, Square payment links
- Auto-generated from measurement report data

### 3. AI Damage Report (Gemini 2.0 Flash)
- Satellite imagery analysis for hail, missing shingles, wind damage, structural issues
- Severity ratings (low/moderate/high/critical), urgency levels
- Insurance claim eligibility notes
- Sales-oriented damage summary for homeowners
- Auto-appended to professional report PDF

### 4. 3D Roof Visualizer (Three.js)
- Procedural house model with swappable roof materials
- 12 shingle colors + 8 sheet metal colors
- 2D Street View mode with color overlay
- Screenshot capture for proposals
- Route: `/visualizer/:orderId`

### 5. Square Payment Integration
- Invoice payment links via Square API
- Service invoice pages for cold-call subscriptions
- Proposal acceptance triggers Square checkout
- Stripe fully removed

### 6. Full CRM Suite
- Customers, Invoices, Proposals, Jobs, Pipeline
- Per-user data isolation (owner_id scoped)
- D2D Manager, Email Outreach, Team Management

### 7. Roofer Secretary AI (LiveKit + Twilio/SIP)
- AI receptionist powered by LiveKit voice agents
- Inbound/outbound call handling
- Call forwarding from customer's personal cell
- Three modes: Receptionist, Answering Service, Always On
- FAQ knowledge base, appointment booking, email notifications

---

## Roofer Secretary AI — Phone Number Configuration

### How It Works
Each Secretary AI customer needs **two phone numbers**:

| # | Phone | Description | Who Provides It |
|---|-------|-------------|-----------------|
| 1 | **Personal Phone** | Customer's personal cell — they forward calls FROM this number when unavailable | Customer already has this |
| 2 | **Agent Phone (SIP)** | Purchased SIP/VoIP number the AI agent uses for inbound & outbound calls | Customer purchases from Twilio/Vonage/Telnyx |

### Call Flow
```
Homeowner calls roofer → Roofer's Personal Cell
  ↓ (busy / after hours / no answer)
  → Call forwards to Agent Phone Number (SIP)
  → LiveKit AI Secretary picks up
  → Handles call (FAQ, booking, message, transfer)
  → Notifies roofer via SMS/email
```

### Pre-Configured Account
- **dev@reusecanada.ca** → Agent Phone: `+1 (484) 964-9758` (pre-owned LiveKit number)
- Provider: LiveKit (auto-assigned on account creation)

### New Customer Setup
1. Customer purchases a SIP phone number from a provider:
   - **Twilio**: https://www.twilio.com/en-us/phone-numbers
   - **Vonage**: https://www.vonage.com/communications-apis/phone-numbers/
   - **Telnyx**: https://telnyx.com/products/phone-numbers
2. Enter their personal phone + agent phone in the onboarding form
3. Configure call forwarding on their cell provider:
   - **Telus**: `*21*[agent_number]#`
   - **Rogers**: `**21*[agent_number]#`
   - **Bell**: `*72[agent_number]`
4. Secretary AI is live — calls forward to AI when customer is unavailable

### Pricing
- **Monthly Subscription**: $149/mo
- **One-Time Setup Fee**: $299

---

## Super Admin Features

### Customer Onboarding (`/super-admin` → Customer Ops)
- Create customer accounts with password + branding
- Assign personal phone + agent phone numbers
- Select phone provider (Twilio/LiveKit/Vonage/Telnyx)
- Choose Secretary AI mode
- Toggle AI on/off per customer
- Forwarding instructions auto-generated per carrier

### Cold-Call Invoicing
- Pre-filled invoice template ($149/mo + $299 setup)
- Dynamic line items with tax calculation
- Square payment link generation
- Public invoice page at `/service-invoice/:id`
- Lifecycle tracking: draft → sent → viewed → paid

### Call Center Management
- Daily metrics: total calls, connects, hot leads, conversions
- Agent performance table
- Sales script library (Cold Call, Follow Up, Demo, Close, Objection Handler)
- Script activation toggles + usage tracking

---

## Key Routes

| Route | Description |
|-------|-------------|
| `/` | Marketing landing page |
| `/login` | Login/register |
| `/admin` | Admin dashboard |
| `/customer/dashboard` | Customer portal (8-tile hub) |
| `/customer/reports` | Roof report history |
| `/visualizer/:orderId` | 3D Roof Visualizer |
| `/proposal/compare/:groupId` | Good/Better/Best comparison |
| `/proposal/view/:token` | Single proposal view |
| `/service-invoice/:id` | Service invoice (cold-call) |
| `/super-admin` | Super Admin panel |
| `/terms` | Terms of Service |
| `/privacy` | Privacy Policy |

## Key API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/reports/:id/generate` | Generate roof measurement report |
| POST | `/api/reports/:id/damage-report` | AI damage assessment (Gemini) |
| GET | `/api/reports/:id/3d-data` | 3D Visualizer data (address, coords, satellite) |
| GET | `/api/reports/:id/html` | Professional HTML report |
| POST | `/api/invoices/pricing/calculate` | Pricing engine (supports `tiered: true`) |
| POST | `/api/crm/proposals/from-report` | Report → Tiered proposal pipeline |
| POST | `/api/crm/proposals/create-tiered` | Create Good/Better/Best proposals |
| POST | `/api/crm/proposals/respond/:token` | Accept/decline proposal |
| POST | `/api/square/create-payment-link` | Generate Square payment link |
| POST | `/api/admin/superadmin/onboarding/create` | Create customer + Secretary AI |
| POST | `/api/admin/superadmin/service-invoices/create` | Create cold-call invoice |
| GET | `/api/admin/superadmin/call-center/stats` | Call center metrics |

---

## Database (Cloudflare D1)

### Key Tables
- `customers` — User accounts (roofer admins + superadmins)
- `orders` — Roof measurement orders
- `reports` — Generated reports (HTML, raw data, damage analysis)
- `crm_proposals` — Tiered proposals with group IDs
- `crm_proposal_items` — Line items per proposal
- `crm_invoices` — Customer invoices
- `onboarded_customers` — Secretary AI onboarding records
- `service_invoices` — Cold-call subscription invoices
- `secretary_config` — Per-customer AI secretary settings
- `secretary_subscriptions` — Subscription tracking
- `sales_scripts` — Call center script library
- `cc_daily_stats` — Daily call metrics cache

### Migrations
43 migration files in `migrations/` directory (0001 through 0043)

---

## Tech Stack
- **Backend**: Cloudflare Workers + Hono framework (TypeScript)
- **Frontend**: Vanilla JS + Tailwind CSS (CDN) + Font Awesome
- **3D**: Three.js r128 (CDN) + OrbitControls
- **Database**: Cloudflare D1 (SQLite)
- **Payments**: Square API v2
- **AI**: Gemini 2.0 Flash (damage analysis, report enhancement)
- **Maps**: Google Solar API + Maps Static API + Street View
- **Telephony**: LiveKit (voice agents) + Twilio/SIP (phone numbers)
- **Email**: Gmail OAuth2 + Resend (fallback)
- **Build**: Vite + TypeScript → dist/_worker.js

## Environment Variables

| Key | Description |
|-----|-------------|
| `GOOGLE_SOLAR_API_KEY` | Google Solar API |
| `GOOGLE_MAPS_API_KEY` | Google Maps (frontend + Street View) |
| `GEMINI_ENHANCE_API_KEY` | Gemini 2.0 Flash for AI analysis |
| `GOOGLE_VERTEX_API_KEY` | Gemini REST API (fallback) |
| `SQUARE_ACCESS_TOKEN` | Square payment processing |
| `SQUARE_APPLICATION_ID` | Square app ID |
| `SQUARE_LOCATION_ID` | Square location |
| `LIVEKIT_API_KEY` | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | LiveKit Cloud API secret |
| `LIVEKIT_URL` | LiveKit Cloud WebSocket URL |
| `GMAIL_CLIENT_ID` | Gmail OAuth2 Client ID |
| `GMAIL_CLIENT_SECRET` | Gmail OAuth2 Client Secret |

---

## Recommended Next Steps

### Phase 1: Platform Improvements (Immediate)

#### User Experience
1. **Onboarding Wizard** — Replace static login with a guided 3-step signup: Business Info → Plan Selection → Payment. Reduces drop-off from registration to first report.
2. **Customer Notification Center** — Real-time toast notifications when reports complete, proposals are viewed, payments received. Push notifications via service worker for mobile.
3. **Multi-Language Support** — Add French (Quebec market) and Spanish (US expansion). Use i18n JSON files with Cloudflare Workers locale detection.
4. **Dark Mode Toggle** — Customer dashboard dark mode. Already have dark styling in visualizer — extend to CRM views.
5. **Keyboard Shortcuts** — Power users want: `N` = new order, `R` = refresh, `Esc` = close modal. Add command palette (Ctrl+K).
6. **Bulk Operations** — Select multiple orders/proposals for batch email, export CSV, or status change.

#### Authentication & Security
7. **Two-Factor Authentication (2FA)** — Add TOTP-based 2FA using Web Crypto OTP generation. Essential for admin/superadmin accounts.
8. **OAuth Login** — Add "Login with Google" and "Login with Apple" via OAuth 2.0. Reduces signup friction for contractors who dislike password forms.
9. **Session Management** — Add "Active Sessions" view showing logged-in devices. Allow remote session revocation.
10. **Rate Limiting** — Implement per-IP and per-user rate limits on API endpoints to prevent abuse.

### Phase 2: Roof Report Improvements

#### Measurement Accuracy
11. **Multi-Source Satellite Imagery** — Integrate Nearmap or EagleView API alongside Google Solar for higher-resolution aerial images (5cm vs 50cm). Fall back gracefully.
12. **LiDAR Integration** — When available, accept LiDAR point cloud uploads (.las/.laz files). Process in Workers using a lightweight parser for sub-inch accuracy.
13. **Manual Measurement Editor** — Allow roofers to draw/adjust roof segments on the satellite image. Canvas-based polygon editor with drag handles.
14. **Historical Comparison** — Store previous reports for same address. Show change detection (new damage, added structures, vegetation growth).
15. **Weather Overlay** — Pull historical hail/storm data from NOAA for the property address. Auto-flag properties in recent storm paths.

#### Report Quality
16. **PDF Export (Native)** — Replace browser print-to-PDF with server-side PDF generation using Cloudflare Browser Rendering API or Puppeteer on a Cloudflare Durable Object.
17. **Report Templates** — Let roofers customize report branding (logo placement, color scheme, footer text) via a template editor. Store in D1.
18. **Material Pricing Integration** — Pull real-time shingle pricing from distributor APIs (ABC Supply, Beacon Roofing). Auto-update proposal costs.
19. **Insurance Supplement Report** — Generate Xactimate-compatible reports. Parse damage findings into insurance supplement line items.
20. **Video Walkthrough** — Generate a short AI narrated video (via ElevenLabs TTS + image slideshow) summarizing the report findings. Embed in customer-facing proposals.

### Phase 3: Visual & Frontend Improvements

#### 3D Visualizer Enhancements
21. **Actual Roof Geometry** — Use the report's facet data to build the actual measured roof shape in Three.js, not just a generic house model.
22. **Texture Mapping** — Replace flat color swatches with real shingle texture images (bump maps + normal maps for realistic appearance).
23. **AR Mode** — Add WebXR support so homeowners can view the 3D model in augmented reality on their phone, projected onto their actual house.
24. **Before/After Slider** — Side-by-side comparison: current roof satellite image vs. proposed new roof color. Draggable slider.
25. **Solar Panel Overlay** — Show potential solar panel placement on the 3D model using Google Solar sunlight data. Cross-sell opportunity.

#### Landing Page & Marketing
26. **Animated Hero Section** — Replace static hero with a Three.js mini-scene showing a house getting a new roof. Parallax scroll effects.
27. **Customer Testimonials Carousel** — Auto-rotate video testimonials from satisfied roofers. Social proof increases conversion.
28. **Live Demo Mode** — Let visitors generate a sample report for a demo address without logging in. Capture email for follow-up.
29. **SEO Optimization** — Add structured data (JSON-LD) for local business schema. Generate city-specific landing pages (/edmonton-roof-reports, /calgary-roof-measurement).
30. **Blog/Content Hub** — Add a blog section for SEO. Topics: "How Satellite Roof Measurement Works", "Insurance Claims After Hail Season", "Alberta Roofing Code Updates".

### Phase 4: iOS App Store Deployment

#### Architecture for iOS
31. **Progressive Web App (PWA) — Immediate**
    - Add `manifest.json` with app name, icons, theme colors
    - Register service worker for offline caching
    - Enable "Add to Home Screen" prompt
    - Works on iOS Safari immediately — no App Store required
    - Cost: $0, Time: 1-2 days

32. **Capacitor Wrapper — Recommended Path**
    - Use [Capacitor](https://capacitorjs.com/) by Ionic to wrap the existing web app in a native iOS shell
    - `npm install @capacitor/core @capacitor/ios`
    - `npx cap init RoofReporterAI com.roofreporterai.app`
    - `npx cap add ios && npx cap open ios`
    - Your existing Hono/Tailwind frontend loads inside a native WKWebView
    - Add native plugins: Push Notifications, Camera, Geolocation, Haptics
    - Sign with Apple Developer certificate ($99/yr) → Submit to App Store
    - Cost: ~$99/yr Apple Developer, Time: 1-2 weeks
    - **This is the fastest path to the App Store**

33. **Native Features via Capacitor Plugins**
    - `@capacitor/camera` — Take photos of roof damage on-site
    - `@capacitor/geolocation` — Auto-fill address from GPS
    - `@capacitor/push-notifications` — Real-time alerts (report ready, proposal viewed)
    - `@capacitor/share` — Native share sheet for proposals
    - `@capacitor/haptics` — Tactile feedback on actions
    - `@capacitor/app` — Deep linking (roofreporterai://report/123)

34. **App Store Requirements**
    - Apple Developer Account ($99/yr): https://developer.apple.com/programs/
    - App Icons: 1024x1024 + all required sizes (use app-icon generator)
    - Screenshots: 6.7" (iPhone 15 Pro Max), 6.1" (iPhone 15), 5.5" (iPhone 8 Plus), 12.9" (iPad Pro)
    - Privacy Policy URL (already at `/privacy`)
    - App Review Guidelines compliance: no web-only wrapper — must add native functionality
    - Estimated review time: 1-3 business days

35. **React Native Rebuild — Long Term (Optional)**
    - Full native rebuild if performance demands exceed Capacitor's capabilities
    - Share backend (Cloudflare Workers) — only rebuild frontend
    - Use React Navigation, React Native Paper/NativeWind for UI
    - Cost: 2-4 months development, but best native performance
    - Only recommended if App Store review rejects Capacitor wrapper

### Phase 5: Revenue & Growth

36. **Subscription Tiers** — Expand from single credit-pack model to monthly plans:
    - **Starter** ($49/mo): 10 reports, basic CRM
    - **Professional** ($149/mo): 50 reports, full CRM, Secretary AI
    - **Enterprise** ($499/mo): Unlimited reports, white-label, API access, priority support

37. **White-Label Program** — Allow roofing companies to rebrand the platform entirely. Custom domain, logo, colors, email templates. $999 setup + $299/mo.

38. **Affiliate/Referral Program** — Roofers refer other roofers → earn commission or free credits. Viral growth in tight-knit roofing communities.

39. **Insurance Adjuster Portal** — Dedicated portal for insurance adjusters to order damage assessments. Different pricing tier. Massive TAM.

40. **Supplier Marketplace** — Connect roofers with material suppliers. ABC Supply, Beacon, SRS. Earn referral fees on material orders placed through the platform.

---

## Version History

### v9.0 (Current — 2026-03-16)
- Secretary AI phone onboarding (personal phone + agent phone separation)
- Pre-configured LiveKit number for dev@reusecanada.ca (+14849649758)
- Twilio/Vonage/Telnyx guidance for new customers
- 3D Roof Visualizer (Three.js procedural house + 20 color swatches)
- 3-Tier Good/Better/Best proposals with comparison page
- AI Damage Report (Gemini satellite analysis)
- Customer Onboarding with carrier forwarding instructions
- Cold-Call Invoicing ($149/mo + $299 setup)
- Call Center Management (metrics + sales scripts)
- Square payments (Stripe fully removed)
- Migration 0043: personal_phone + agent_phone_number columns

### v8.0
- LiveKit-only phone verification (no Twilio dependency)
- Secretary AI voice agent integration
- AI Call Center module

### v7.0
- Cloud Run Custom AI Integration (dual-path architecture)
- Reports refactor (6,996 → 641 lines)
- Service layer extraction
- Geospatial utilities with unit tests

### v6.0
- Full CRM Suite (Customers, Invoices, Proposals, Jobs, Pipeline)
- Property Overlap Detection
- Segment Toggle UI

### v5.0
- Solar DataLayers + GeoTIFF DSM processing
- Hybrid measurement pipeline

### v4.0
- Gmail OAuth2 email delivery
- Modern white/blue theme
- Login/register system

---

*Built by Reuse Canada — Transforming waste into value, transforming roofing into precision.*
