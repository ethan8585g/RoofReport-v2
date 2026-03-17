# RoofReporterAI — Professional Roof Measurement & Sales Platform

## Project Overview
- **Name**: RoofReporterAI
- **Version**: 9.6 (Onboarding Config, Phone Marketplace, Google OAuth, Meta Connect Fix)
- **Domain**: www.roofreporterai.com
- **Production**: https://roofing-measurement-tool.pages.dev
- **GitHub**: https://github.com/ethan8585g/roofreporter-ai-good-copy
- **Platform**: Cloudflare Pages + Workers + D1
- **Status**: Active
- **Last Updated**: 2026-03-17 (v9.6)

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

### 7. Roofer Secretary AI (LiveKit Voice Agent — DEPLOYMENT READY)
- **AI receptionist verified and working** — powered by LiveKit Agents + Inference
- **Deployment Package**: Complete in `livekit-agent/` — Dockerfile, livekit.toml, agent.py
- **Deploy to LiveKit Cloud**: `lk cloud auth` → `lk agent create --yes .` (free tier: 1,000 min/mo)
- **Deploy to VPS**: `docker-compose up -d` or `./deploy.sh` (~$5/mo)
- **SIP Infrastructure**: Trunk `ST_acLimvCPo5ES` + Dispatch `SDR_cZDM2nFXpW7o`
- **Call Flow**: 780-983-3335 → forwarded → +1(484) 964-9758 → LiveKit SIP → AI Agent answers
- **Voice Stack**: Deepgram Nova-3 STT → GPT-4.1-mini LLM → Cartesia Sonic-3 TTS
- **Agent Persona Selection**: 6 AI agents (3 female, 3 male) with unique voice personalities
  - **Female**: Sarah (warm/professional), Emily (bright/energetic), Jessica (calm/authoritative)
  - **Male**: James (deep/reassuring), Mike (strong/confident), Alex (friendly/conversational)
  - Custom agent name field — agent introduces itself by chosen name
- Three modes: Directory, Never-Voicemail Answering, Full AI Secretary
- Rick's Roofing greeting script + Q&A + General Notes all configured
- Function tools: take_message, schedule_estimate, handle_emergency, get_business_hours
- Public agent-config API: `/api/secretary/agent-config/:customerId` (LiveKit agent fetches live config)
- Webhook endpoints: message capture, appointment booking, call completion logging
- Manual phone entry flow with carrier-specific forwarding instructions

### 8. Secretary AI Call Center Dashboard (NEW in v9.5)
- **Dashboard Call Center Section**: Highly visible gradient-styled section on customer dashboard
  - Live stats: Total calls, today's calls, new leads, avg call duration
  - New lead alerts with direct link to leads tab
  - Follow-up needed alerts for pending callbacks
  - 5 most recent calls with caller info, outcome badge, duration, time ago
- **Call Log Tab** (Secretary page):
  - Search calls by name, phone, or summary
  - Filter: All Calls, Leads Only, Needs Follow-Up
  - Each call shows: caller name/phone, lead badge, follow-up badge, outcome, sentiment icon, duration, AI summary, conversation highlights
  - Click any call → Full Transcript Modal
- **Full Transcript Viewer**:
  - Complete word-by-word call transcript with speaker color coding (Agent: purple, Caller: blue)
  - AI-generated call summary, key highlights, follow-up notes
  - Linked messages taken, appointments booked during the call
  - Contact info: property address, email, service type
  - Sentiment badge (positive/neutral/negative), outcome badge, duration
  - Lead status management via dropdown in footer
- **Leads Tab**:
  - Auto-captured from calls (caller name + phone + request = lead)
  - Pipeline stages: New → Contacted → Qualified → Converted / Lost
  - Lead quality stars (cold/warm/hot)
  - Service type, property address, email, phone
  - Click-to-view full call transcript
  - Stage filter with counts per stage
  - Inline status change via dropdown
- **Enhanced Backend Endpoints**:
  - `GET /api/secretary/call-stats` — aggregated stats for dashboard
  - `GET /api/secretary/calls?filter=all|leads|follow_up&search=...` — filtered call log
  - `GET /api/secretary/calls/:id` — full transcript + linked data
  - `PUT /api/secretary/calls/:id` — update lead status, follow-up completion
  - `GET /api/secretary/leads?status=new|contacted|qualified|converted|lost` — leads pipeline
  - `POST /api/secretary/webhook/call-complete` — enhanced with is_lead, sentiment, highlights, service_type, property_address

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
| `/signup` | **NEW** 3-step onboarding wizard |
| `/login` | Admin login |
| `/customer/login` | Customer login/register |
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
| POST | `/api/customer/validate-email` | **NEW** Real-time email availability check |
| POST | `/api/customer/set-tier` | **NEW** Set subscription tier + trial period |
| POST | `/api/secretary/quick-connect/save-phones` | **NEW** Save business + AI phone numbers (manual entry) |
| POST | `/api/secretary/quick-connect/activate` | **UPDATED** Deploys LiveKit trunk + dispatch rule on activation |
| GET | `/api/secretary/quick-connect/status` | Phone setup status with trunk/dispatch info |
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
44 migration files in `migrations/` directory (0001 through 0044)

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

## Recommended Next Steps (v9.6)

### Phase 1 — Immediate Priority (Next 1-2 Days)
1. **Configure Google OAuth** — Set `GOOGLE_OAUTH_CLIENT_ID` in Cloudflare Pages secrets
   - Create OAuth 2.0 Client at https://console.cloud.google.com/apis/credentials
   - Add authorized redirect URI: `https://www.roofreporterai.com/customer/google-callback`
   - Add `https://roofing-measurement-tool.pages.dev/customer/google-callback` too
   - Set `GOOGLE_OAUTH_CLIENT_ID` env var in Cloudflare dashboard
2. **Configure Meta/Facebook App** — Set `META_APP_ID` and `META_APP_SECRET` in Cloudflare Pages secrets
   - Create app at https://developers.facebook.com/apps/
   - Add "Facebook Login" product, set redirect URI to your domain
   - Copy App ID and App Secret to Cloudflare env vars
3. **Configure Twilio for Phone Marketplace** — Set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` in Cloudflare secrets
   - Sign up at https://www.twilio.com/
   - Get Account SID and Auth Token from Console dashboard
4. **Configure AdMob for iOS App Store** — In Super Admin → Onboarding Config:
   - Create AdMob account at https://admob.google.com/
   - Create a Banner ad unit and an Interstitial ad unit
   - Paste both Unit IDs into the Onboarding Config panel
5. **Set Onboarding Pricing** — Visit Super Admin → Onboarding Config
   - Configure setup fee (if any), monthly sub ($49.99), annual sub ($499.99)
   - Create report pack discounts for signup (e.g., 5-pack at 10% off, 15-pack at 25% off)
   - Toggle feature gating for free vs paid tiers
6. **Deploy LiveKit Agent to LiveKit Cloud (READY)** — Deployment package is complete in `livekit-agent/`. Run from your local machine:
   ```bash
   git clone https://github.com/ethan8585g/roofreporter-ai-good-copy.git
   cd roofreporter-ai-good-copy/livekit-agent
   lk cloud auth           # Opens browser -> log in to LiveKit Cloud
   lk agent create --yes . # Builds Docker image, uploads, registers agent
   lk agent status          # Verify it's running
   ```
2. **End-to-End Call Test with Full Logging** — Call 780-983-3335, verify AI answers, check that the call appears in the dashboard Call Center section with full transcript, summary, sentiment, and lead detection.
3. **Connect Cold Call Center to LiveKit Outbound SIP** — Wire the customer cold-call center to LiveKit's outbound SIP dialing:
   - When customer clicks "Start Calling" on a list, the backend requests a LiveKit SIP outbound call to the next prospect's phone
   - On call-complete webhook from LiveKit agent, post to `/api/customer-calls/call-complete` with transcript, summary, sentiment, lead detection
   - Auto-advance to next prospect in queue
4. **Build Cold Call LiveKit Agent (livekit-agent/cold-call-agent.py)** — Create a sales-specific AI agent that:
   - Uses the customer's saved script (intro, pitch, objections, closing) from `/api/customer-calls/config`
   - Detects interest level, books appointments, handles objections
   - Posts comprehensive call data to the webhook on call end
5. **SMS Lead Notification** — When AI captures a lead (name + phone + interested), auto-SMS the business owner
6. **Email Lead Notification** — Send email with full call transcript + AI summary when interest is detected

### Phase 2 — Short Term (2-4 Weeks)
7. **Call Recording & Audio Playback** — Enable LiveKit room recording, store audio URL in D1, add "Play Recording" button in call detail modal
8. **Auto-Scheduler** — Allow customers to schedule cold call campaigns (e.g., "Call from 9am-5pm MST, Mon-Fri, max 50 calls/day")
9. **LinkedIn Scraper Integration** — Build or integrate a LinkedIn scraping tool that auto-populates prospect lists with contact info, company, title
10. **A/B Script Testing** — Allow multiple script variants per campaign with conversion tracking
11. **Agent Voice Preview** — Add "Listen to Voice" button in Agent Settings so users can hear each voice before choosing
12. **Push Notifications (PWA)** — Browser push notifications for new leads and missed calls
13. **Multi-Customer Agent** — Enable LiveKit agent to handle calls for multiple roofing companies simultaneously
14. **Outbound Calling for Secretary** — Add outbound call capability for follow-ups and callbacks using LiveKit SIP outbound trunks
15. **Square Payment Link SMS** — For emergency tarping dispatch, agent triggers SMS with Square payment link

### Phase 3 — Medium Term (1-3 Months)
16. **Real-Time Dashboard Updates** — WebSocket or SSE for live call status updates (ringing, connected, completed) without page refresh
17. **Prospect Scoring AI** — Use AI to auto-score prospects based on company size, location, website activity before calling
18. **CRM Integration** — Auto-create CRM contacts from cold call leads; sync appointment bookings to Jobs module
19. **Notification Center** — In-app notification bell with real-time alerts for new leads, callbacks, appointments
20. **Mobile PWA** — manifest.json + service worker for installable progressive web app
21. **French/Spanish Language Support** — Multilingual agent scripts and greeting templates
22. **Analytics Dashboard** — Call volume trends, lead conversion rates, peak call hours, response time metrics, A/B test results
23. **Calendar Integration** — Sync booked appointments with Google Calendar / Outlook

### Phase 4 — Long Term (3-6 Months)
24. **Native iOS App (Capacitor)** — Wrap in Capacitor for App Store deployment with push notifications, camera, GPS
25. **AI-Generated Video Roof Reports** — Narrated video walkthrough of measurement data using AI voiceover
26. **Insurance-Compatible Report Format** — Xactimate/Symbility-compatible output for insurance claim submissions
27. **Supplier Marketplace** — Connect roofers with material suppliers (ABC Supply, Beacon, SRS)
28. **White-Label Program** — Custom domain, logo, colors ($999 setup + $299/mo)
29. **Outbound Marketing Campaigns** — AI-generated email + phone follow-up sequences for converted leads
24. **Outbound Marketing Calls** — AI agent proactively calls leads who haven't responded within 48 hours.

---

## Version History
18. **Insurance Report Format** — Generate reports compatible with insurance claim requirements.
19. **Supplier Marketplace** — Connect roofers with material suppliers (ABC Supply, Beacon, SRS).
20. **White-Label Platform** — Allow other businesses (plumbers, HVAC, electricians) to use the AI Secretary under their own branding.

---

## Version History

### v9.6 (Current — 2026-03-17)
- **Customer Onboarding Configuration** — Super Admin can fully customize signup experience
  - Configurable setup fees, monthly/annual subscription pricing
  - Report pack discounts (bundles offered during signup)
  - Feature gating: toggle features on/off, configure free tier vs paid
  - AdMob banner + interstitial ID fields for iOS ad-supported tier
  - Ad-supported free tier: users choose $49.99/mo subscription OR ads after trial
  - Free trial reports count and trial period (days) fully adjustable
- **Phone Number Marketplace** — Purchase DID numbers via Twilio
  - Search available numbers by country (CA/US) and area code
  - One-click purchase via Twilio API
  - Owned numbers management with customer assignment
  - Ideal for Roofer Secretary AI number provisioning
- **Google Sign-In** — Customer login page now has Google OAuth button
  - OAuth 2.0 implicit flow with ID token verification
  - `/customer/google-callback` handles token exchange
  - `/api/public/google-oauth-config` (public) returns client ID
  - Requires `GOOGLE_OAUTH_CLIENT_ID` env var
- **Meta Connect Fix** — Facebook OAuth now functional
  - Facebook SDK (connect.facebook.net) dynamically loaded on super admin page
  - `/api/public/meta-app-id` provides META_APP_ID for FB.init()
  - FB.login() works with loaded SDK + manual token fallback
- **Email Outreach Lists in Call Center** — Cross-module data sharing
  - Call Center Contact Lists tab shows Email Outreach lists
  - Import button converts email contacts into call center prospects
- **Canva Integration Removed** from super admin (replaced by Onboarding Config + Phone Marketplace)
- **Post-Trial Subscription Model**:
  - Option 1: $49.99/month subscription (full access)
  - Option 2: Ad-supported free tier (AdMob for iOS App Store eligibility)
- **Customer Cold Call Center** — Full AI outbound dialer dashboard for each customer
  - Page route: `/customer/cold-calls`
  - Dashboard tile added to customer navigation grid (orange, "Cold Call Center")
  - 6-tab interface: Overview, Prospect Lists, All Prospects, Call Logs, Leads, Agent Settings
- **Prospect List Management**
  - Create named lists (LinkedIn Scrapes, Google Maps, etc.)
  - CSV bulk import with flexible column mapping (contact_name, phone, email, linkedin_url, etc.)
  - Smart duplicate detection by phone number
  - Progress tracking (% called, leads found)
- **Call Log Dashboard**
  - Real-time call history with outcome filtering: All/Answered/No Answer/Voicemail/Interested/Appointment/Callback/DNC
  - Each call shows: AI summary, conversation highlights, sentiment, duration, outcome badge
  - Clickable transcript viewer — full word-by-word conversation in chat bubble format
  - Agent notes per call, lead quality ratings, follow-up flags
- **Leads & Appointments Panel**
  - AI-identified hot leads with quality stars, appointment status, contact info
  - Alert banners for new leads, pending callbacks, booked appointments
  - Direct links to view full transcripts
- **Agent Configuration**
  - 6 voice options: Alloy (neutral), Echo (male authoritative), Fable (male warm), Onyx (male deep), Nova (female warm), Shimmer (female energetic)
  - Custom agent name and business name
  - 4-section script builder: Intro, Pitch, Objection Handling, Closing
  - Callback number configuration
- **Prospect Funnel Visualization** — pipeline view (Queue → Called → Leads → Appointments → DNC)
- **Backend API**: 20+ endpoints at `/api/customer-calls/*` with customer auth isolation
- **DB Migration 0046**: 4 new tables (cust_cc_lists, cust_cc_prospects, cust_cc_call_logs, cust_cc_config)
- All 3 GitHub repos synced, deployed to Cloudflare Pages

### v9.5 (2026-03-16)
- **Secretary AI Call Center Dashboard** — Highly visible section on customer dashboard
  - Live call stats (total/today/week calls, new leads, follow-ups, avg duration)
  - New lead alerts + follow-up needed alerts with direct links
  - Recent calls mini-list with sentiment, outcome, and duration
- **Full Call Log** with search, filter (all/leads/follow_up), and clickable transcript viewer
- **Full Transcript Modal** — click any call to see complete word-by-word conversation
  - AI summary, key highlights, follow-up notes, linked messages/appointments
  - Speaker color coding (Agent: purple, Caller: blue)
- **Leads Pipeline** — auto-captured leads with stage management (new/contacted/qualified/converted/lost)
  - Quality stars, service type, property address, inline status change
- **Agent Persona Selector** — 6 AI agents (3 female, 3 male):
  - Sarah (warm/professional), Emily (bright/energetic), Jessica (calm/authoritative)
  - James (deep/reassuring), Mike (strong/confident), Alex (friendly/conversational)
  - Custom agent name field
- Backend: config POST now persists agent_name + agent_voice
- Enhanced webhook/call-complete accepts full lead data, sentiment, highlights
- All DB migration columns verified in production D1
- All 3 GitHub repos synced

### v9.4 (2026-03-16)
- **LiveKit Cloud Deployment Package READY** — Full `livekit-agent/` directory with Dockerfile, livekit.toml, agent.py
- Production deployment: `lk cloud auth` + `lk agent create --yes .` (one-time browser login)
- Alternative VPS deployment: Docker Compose or `deploy.sh` on any $5/mo server
- LiveKit agent verified: auto-dispatches to rooms, fetches Rick's Roofing config from API, answers calls
- Agent tested: room creation → job request → config loaded → session started → agent connected
- Updated Dockerfile with health checks, optimized .dockerignore
- Clean livekit.toml (no hardcoded credentials — LiveKit Cloud auto-injects)
- Comprehensive `livekit-agent/README.md` deployment guide

### v9.3 (2026-03-16)
- **LiveKit Agent LIVE** — Python voice agent registered with LiveKit Cloud (Worker `AW_u44mtZpi6GTD`)
- Agent answers calls forwarded from 780-983-3335 to +14849649758 using Rick's Roofing script
- Voice stack: Deepgram Nova-3 STT → GPT-4.1-mini → Cartesia Sonic-3 TTS
- Public agent-config API endpoint (`/api/secretary/agent-config/:customerId`)
- Public webhook endpoints for message capture, appointment booking, call completion
- Function tools: take_message, schedule_estimate, handle_emergency, get_business_hours
- Agent fetches live config from production API for each call
- All 3 GitHub repos synced (origin, goodcopy, newrepo)

### v9.2 (2026-03-16)
- Manual phone entry flow for Secretary AI
- Remove placeholder +17800000001, add real phone +14849649758
- LiveKit SIP trunk and dispatch rule creation on activation
- Edit Phone Configuration modal

### v9.1 (2026-03-16)
- **Onboarding Wizard** — 3-step guided signup at `/signup` (Phase 1, Item 1)
  - Step 1: Business Info (name, company, email verification, phone, city/province, password)
  - Step 2: Plan Selection (Starter $49/mo, Professional $149/mo, Enterprise $499/mo)
  - Step 3: Confirmation & 14-day free trial activation
- Subscription tier system (Starter / Professional / Enterprise)
- Feature comparison table across all tiers
- Password strength indicator with visual feedback
- Auto-redirect to dashboard after activation
- Landing page CTAs now link to `/signup`
- Migration 0044: subscription_tier, trial_ends_at, monthly_report_limit, referral_code columns
- New API: POST /api/customer/validate-email, POST /api/customer/set-tier

### v9.0 (2026-03-16)
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
