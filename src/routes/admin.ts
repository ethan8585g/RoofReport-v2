import { Hono } from 'hono'
import type { Bindings } from '../types'
import { validateAdminSession, requireSuperadmin } from './auth'

export const adminRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// ADMIN AUTH MIDDLEWARE — Validates session on every request
// ============================================================
adminRoutes.use('/*', async (c, next) => {
  // Allow init-db without auth (it's now protected separately)
  // All other routes require valid admin session
  const path = c.req.path.replace('/api/admin', '')
  
  // init-db requires auth separately inside the handler
  if (path === '/init-db') {
    return next()
  }
  
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) {
    return c.json({ error: 'Admin authentication required. Please log in at /login' }, 401)
  }
  
  // Store admin info in context for downstream use
  c.set('admin' as any, admin)
  return next()
})

// Dashboard stats
adminRoutes.get('/dashboard', async (c) => {
  try {
    // Order stats
    const orderStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM orders
    `).first()

    // Revenue stats (EXCLUDES trial orders)
    const revenueStats = await c.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN payment_status = 'paid' AND (is_trial IS NULL OR is_trial = 0) THEN price ELSE 0 END) as total_revenue,
        SUM(CASE WHEN payment_status = 'paid' AND service_tier = 'express' AND (is_trial IS NULL OR is_trial = 0) THEN price ELSE 0 END) as express_revenue,
        SUM(CASE WHEN payment_status = 'paid' AND service_tier = 'standard' AND (is_trial IS NULL OR is_trial = 0) THEN price ELSE 0 END) as standard_revenue,
        SUM(CASE WHEN is_trial = 1 THEN 1 ELSE 0 END) as trial_orders
      FROM orders
    `).first()

    // Tier breakdown
    const tierStats = await c.env.DB.prepare(`
      SELECT service_tier, COUNT(*) as count, SUM(price) as total_value
      FROM orders GROUP BY service_tier
    `).all()

    // Recent orders
    const recentOrders = await c.env.DB.prepare(`
      SELECT o.*, cc.company_name as customer_company_name
      FROM orders o
      LEFT JOIN customer_companies cc ON o.customer_company_id = cc.id
      ORDER BY o.created_at DESC LIMIT 10
    `).all()

    // Customer count (registered platform users — from customers table)
    const customerCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM customers WHERE is_active = 1'
    ).first<{ count: number }>()

    // Customer company count (admin-managed B2B clients)
    const companyCount = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM customer_companies WHERE is_active = 1'
    ).first<{ count: number }>()

    // Recent activity
    const recentActivity = await c.env.DB.prepare(`
      SELECT * FROM user_activity_log ORDER BY created_at DESC LIMIT 20
    `).all()

    // Report/material stats
    let reportStats: any = {}
    try {
      reportStats = await c.env.DB.prepare(`
        SELECT
          COUNT(*) as total_reports,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_reports,
          AVG(gross_squares) as avg_squares,
          AVG(total_material_cost_cad) as avg_material_cost,
          SUM(total_material_cost_cad) as total_material_value,
          AVG(confidence_score) as avg_confidence,
          SUM(CASE WHEN complexity_class = 'simple' THEN 1 ELSE 0 END) as simple_roofs,
          SUM(CASE WHEN complexity_class = 'moderate' THEN 1 ELSE 0 END) as moderate_roofs,
          SUM(CASE WHEN complexity_class = 'complex' THEN 1 ELSE 0 END) as complex_roofs,
          SUM(CASE WHEN complexity_class = 'very_complex' THEN 1 ELSE 0 END) as very_complex_roofs
        FROM reports
      `).first() || {}
    } catch (e) {
      // migration may not have run yet
    }

    return c.json({
      orders: orderStats,
      revenue: revenueStats,
      tiers: tierStats.results,
      recent_orders: recentOrders.results,
      customer_count: customerCount?.count || 0,
      company_count: companyCount?.count || 0,
      recent_activity: recentActivity.results,
      report_stats: reportStats
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to load dashboard', details: err.message }, 500)
  }
})

// ============================================================
// INIT-DB — Protected: requires valid admin session
// In production, use D1 migrations instead.
// This endpoint is kept for dev/emergency recovery only.
// ============================================================
adminRoutes.post('/init-db', async (c) => {
  // Require admin auth for schema initialization
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin || !requireSuperadmin(admin)) {
    return c.json({ error: 'Superadmin authentication required for database initialization' }, 403)
  }

  try {
    // Create tables if they don't exist
    const schema = `
      CREATE TABLE IF NOT EXISTS master_companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT, address TEXT, city TEXT, province TEXT, postal_code TEXT,
        logo_url TEXT, api_key TEXT UNIQUE, is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS customer_companies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_company_id INTEGER NOT NULL,
        company_name TEXT NOT NULL, contact_name TEXT NOT NULL, email TEXT NOT NULL,
        phone TEXT, address TEXT, city TEXT, province TEXT, postal_code TEXT,
        is_active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (master_company_id) REFERENCES master_companies(id)
      );
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_number TEXT UNIQUE NOT NULL,
        master_company_id INTEGER NOT NULL,
        customer_company_id INTEGER,
        property_address TEXT NOT NULL, property_city TEXT, property_province TEXT, property_postal_code TEXT,
        latitude REAL, longitude REAL,
        homeowner_name TEXT NOT NULL, homeowner_phone TEXT, homeowner_email TEXT,
        requester_name TEXT NOT NULL, requester_company TEXT, requester_email TEXT, requester_phone TEXT,
        service_tier TEXT NOT NULL, price REAL NOT NULL,
        status TEXT DEFAULT 'pending', payment_status TEXT DEFAULT 'unpaid',
        payment_intent_id TEXT, estimated_delivery TEXT, delivered_at TEXT, notes TEXT,
        roof_trace_json TEXT, price_per_bundle REAL,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (master_company_id) REFERENCES master_companies(id),
        FOREIGN KEY (customer_company_id) REFERENCES customer_companies(id)
      );
      CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL UNIQUE,
        roof_area_sqft REAL, roof_area_sqm REAL, roof_pitch_degrees REAL,
        roof_azimuth_degrees REAL, max_sunshine_hours REAL, num_panels_possible INTEGER,
        yearly_energy_kwh REAL, roof_segments TEXT, satellite_image_url TEXT,
        dsm_image_url TEXT, mask_image_url TEXT, report_pdf_url TEXT, report_html TEXT,
        api_response_raw TEXT,
        status TEXT DEFAULT 'pending', error_message TEXT,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL,
        stripe_payment_intent_id TEXT, amount REAL NOT NULL, currency TEXT DEFAULT 'CAD',
        status TEXT DEFAULT 'pending', payment_method TEXT, receipt_url TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );
      CREATE TABLE IF NOT EXISTS api_requests_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER, request_type TEXT NOT NULL, endpoint TEXT,
        request_payload TEXT, response_status INTEGER, response_payload TEXT, duration_ms INTEGER,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (order_id) REFERENCES orders(id)
      );
      CREATE TABLE IF NOT EXISTS user_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER, action TEXT NOT NULL, details TEXT,
        ip_address TEXT, user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_company_id INTEGER NOT NULL,
        setting_key TEXT NOT NULL, setting_value TEXT, is_encrypted INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (master_company_id) REFERENCES master_companies(id),
        UNIQUE(master_company_id, setting_key)
      );
    `

    // Execute each CREATE TABLE statement
    const statements = schema.split(';').filter(s => s.trim().length > 0)
    for (const stmt of statements) {
      await c.env.DB.prepare(stmt).run()
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)',
      'CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number)',
      'CREATE INDEX IF NOT EXISTS idx_reports_order ON reports(order_id)',
      'CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id)',
    ]
    for (const idx of indexes) {
      await c.env.DB.prepare(idx).run()
    }

    // Migration 0003: Edge measurements, materials, quality columns
    const migration0003Cols = [
      'edge_measurements TEXT', 'total_ridge_ft REAL', 'total_hip_ft REAL',
      'total_valley_ft REAL', 'total_eave_ft REAL', 'total_rake_ft REAL',
      'material_estimate TEXT', 'gross_squares REAL', 'bundle_count INTEGER',
      'total_material_cost_cad REAL', 'complexity_class TEXT',
      'imagery_quality TEXT', 'imagery_date TEXT', 'confidence_score INTEGER',
      'field_verification_recommended INTEGER DEFAULT 0',
      'professional_report_html TEXT', 'report_version TEXT DEFAULT \'2.0\'',
      'roof_footprint_sqft REAL', 'roof_footprint_sqm REAL', 'area_multiplier REAL',
      'roof_pitch_ratio TEXT'
    ]
    for (const col of migration0003Cols) {
      try { await c.env.DB.prepare(`ALTER TABLE reports ADD COLUMN ${col}`).run() } catch(e) {}
    }

    // Migration 0004: AI Measurement Engine columns
    const migration0004Cols = [
      'ai_measurement_json TEXT', 'ai_report_json TEXT', 'ai_satellite_url TEXT',
      'ai_analyzed_at TEXT', "ai_status TEXT DEFAULT 'pending'", 'ai_error TEXT'
    ]
    for (const col of migration0004Cols) {
      try { await c.env.DB.prepare(`ALTER TABLE reports ADD COLUMN ${col}`).run() } catch(e) {}
    }

    // Migration 0004b: Report generation state machine columns
    const migration0004bCols = [
      'generation_attempts INTEGER DEFAULT 0',
      'generation_started_at TEXT',
      'generation_completed_at TEXT'
    ]
    for (const col of migration0004bCols) {
      try { await c.env.DB.prepare(`ALTER TABLE reports ADD COLUMN ${col}`).run() } catch(e) {}
    }

    // Migration 0005: Authentication system
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'admin' CHECK(role IN ('superadmin', 'admin', 'staff')),
        company_name TEXT,
        phone TEXT,
        is_active INTEGER DEFAULT 1,
        last_login TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `).run()
    try { await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email)').run() } catch(e) {}

    // Migration 0005b: Admin sessions table (secure session management)
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS admin_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER NOT NULL,
        session_token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (admin_id) REFERENCES admin_users(id) ON DELETE CASCADE
      )
    `).run()
    try { await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_sessions_token ON admin_sessions(session_token)').run() } catch(e) {}
    try { await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin ON admin_sessions(admin_id)').run() } catch(e) {}

    // Migration 0006: Customer Portal, Invoices & Sales Tracking
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, phone TEXT, company_name TEXT,
        google_id TEXT UNIQUE, google_avatar TEXT, password_hash TEXT,
        address TEXT, city TEXT, province TEXT, postal_code TEXT,
        is_active INTEGER DEFAULT 1, email_verified INTEGER DEFAULT 0,
        last_login TEXT, notes TEXT, tags TEXT,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
      )
    `).run()

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT UNIQUE NOT NULL, customer_id INTEGER NOT NULL,
        order_id INTEGER, subtotal REAL DEFAULT 0, tax_rate REAL DEFAULT 5.0,
        tax_amount REAL DEFAULT 0, discount_amount REAL DEFAULT 0,
        total REAL DEFAULT 0, currency TEXT DEFAULT 'CAD',
        status TEXT DEFAULT 'draft', issue_date TEXT DEFAULT (date('now')),
        due_date TEXT, paid_date TEXT, sent_date TEXT,
        payment_method TEXT, payment_reference TEXT, notes TEXT,
        terms TEXT DEFAULT 'Payment due within 30 days of invoice date.',
        created_by TEXT, created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (order_id) REFERENCES orders(id)
      )
    `).run()

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL, description TEXT NOT NULL,
        quantity REAL DEFAULT 1, unit_price REAL DEFAULT 0,
        amount REAL DEFAULT 0, sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
      )
    `).run()

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS customer_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL, session_token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
      )
    `).run()

    // Add customer_id to orders if not present
    try { await c.env.DB.prepare('ALTER TABLE orders ADD COLUMN customer_id INTEGER REFERENCES customers(id)').run() } catch(e) {}

    // Migration 0007: Customer credits & Stripe/Square columns
    const customerCreditCols = [
      'report_credits INTEGER DEFAULT 0',
      'credits_used INTEGER DEFAULT 0',
      'stripe_customer_id TEXT',
      'square_customer_id TEXT',
      'subscription_plan TEXT DEFAULT \'free\'',
      'subscription_status TEXT',
      'subscription_start TEXT',
      'subscription_end TEXT'
    ]
    for (const col of customerCreditCols) {
      try { await c.env.DB.prepare(`ALTER TABLE customers ADD COLUMN ${col}`).run() } catch(e) {}
    }

    // Migration 0008: Free trial tracking (separate from paid credits)
    const trialCols = [
      'free_trial_total INTEGER DEFAULT 3',
      'free_trial_used INTEGER DEFAULT 0'
    ]
    for (const col of trialCols) {
      try { await c.env.DB.prepare(`ALTER TABLE customers ADD COLUMN ${col}`).run() } catch(e) {}
    }

    // Migration 0009: Trial flag on orders (so admin can filter trial vs paid)
    try { await c.env.DB.prepare('ALTER TABLE orders ADD COLUMN is_trial INTEGER DEFAULT 0').run() } catch(e) {}

    // Migration 0012: Custom Branding columns on customers table
    const brandingCols = [
      'brand_business_name TEXT',
      'brand_logo_url TEXT',
      'brand_primary_color TEXT DEFAULT \'#1e3a5f\'',
      'brand_secondary_color TEXT DEFAULT \'#0ea5e9\'',
      'brand_tagline TEXT',
      'brand_phone TEXT',
      'brand_email TEXT',
      'brand_website TEXT',
      'brand_address TEXT',
      'brand_license_number TEXT',
      'brand_insurance_info TEXT',
      'ad_facebook_connected INTEGER DEFAULT 0',
      'ad_facebook_page_id TEXT',
      'ad_google_connected INTEGER DEFAULT 0',
      'ad_google_account_id TEXT',
      'ad_meta_pixel_id TEXT',
      'ad_google_analytics_id TEXT'
    ]
    for (const col of brandingCols) {
      try { await c.env.DB.prepare(`ALTER TABLE customers ADD COLUMN ${col}`).run() } catch(e) {}
    }

    // Migration 0010: Remove old CHECK constraint on service_tier
    // RETIRED — This migration was for the initial schema transition.
    // Both local and production databases already use the new schema.
    // No DROP TABLE or destructive operations remain in init-db.
    // Kept as comment for historical reference only.

    // Stripe tables (legacy — kept for historical data)
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS stripe_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER, order_id INTEGER,
        stripe_checkout_session_id TEXT, stripe_payment_intent_id TEXT,
        amount INTEGER DEFAULT 0, currency TEXT DEFAULT 'cad',
        status TEXT DEFAULT 'pending', payment_type TEXT,
        description TEXT,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (order_id) REFERENCES orders(id)
      )
    `).run()

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stripe_event_id TEXT UNIQUE NOT NULL,
        event_type TEXT, payload TEXT, processed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run()

    // Square tables (current payment processor)
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS square_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        square_order_id TEXT,
        square_payment_id TEXT,
        square_payment_link_id TEXT,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'cad',
        status TEXT DEFAULT 'pending',
        payment_type TEXT DEFAULT 'credit_pack',
        description TEXT,
        order_id INTEGER,
        metadata_json TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (order_id) REFERENCES orders(id)
      )
    `).run()

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS square_webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        square_event_id TEXT UNIQUE NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT,
        processed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run()

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS credit_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, description TEXT,
        credits INTEGER NOT NULL, price_cents INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run()

    // Seed default credit packages — only if table is empty (never delete existing data)
    // Pricing: Single=$10, 10=$9/ea, 25=$8/ea, 50=$7/ea, 100=$6/ea
    const pkgCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM credit_packages').first<any>()
    if (!pkgCount?.cnt || pkgCount.cnt === 0) {
      await c.env.DB.prepare(`
        INSERT INTO credit_packages (id, name, description, credits, price_cents, sort_order)
        VALUES
          (1, '10 Pack', '10 reports — $9.00/ea — Save 10%', 10, 9000, 1),
          (2, '25 Pack', '25 reports — $8.00/ea — Save 20%', 25, 20000, 2),
          (3, '50 Pack', '50 reports — $7.00/ea — Save 30%', 50, 35000, 3),
          (4, '100 Pack', '100 reports — best value — $6.00/ea — Save 40%', 100, 60000, 4)
      `).run()
    }

    // Customer portal indexes
    const custIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)',
      'CREATE INDEX IF NOT EXISTS idx_customers_google_id ON customers(google_id)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status)',
      'CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id)',
      'CREATE INDEX IF NOT EXISTS idx_customer_sessions_token ON customer_sessions(session_token)',
      'CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)'
    ]
    for (const idx of custIndexes) {
      try { await c.env.DB.prepare(idx).run() } catch(e) {}
    }

    // ============================================================
    // Migration 0011: CRM Module — Business Customers, Invoices, Proposals, Jobs
    // These are the USER'S business customers (homeowners/leads), NOT platform customers
    // ============================================================
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS crm_customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        name TEXT NOT NULL, email TEXT, phone TEXT, company TEXT,
        address TEXT, city TEXT, province TEXT, postal_code TEXT,
        status TEXT DEFAULT 'active', source TEXT,
        notes TEXT, tags TEXT,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (owner_id) REFERENCES customers(id)
      )
    `).run()

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS crm_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        crm_customer_id INTEGER NOT NULL,
        invoice_number TEXT UNIQUE NOT NULL,
        subtotal REAL DEFAULT 0, tax_rate REAL DEFAULT 5.0,
        tax_amount REAL DEFAULT 0, total REAL DEFAULT 0,
        currency TEXT DEFAULT 'CAD',
        status TEXT DEFAULT 'draft',
        issue_date TEXT DEFAULT (date('now')), due_date TEXT, paid_date TEXT, sent_date TEXT,
        payment_method TEXT, notes TEXT,
        terms TEXT DEFAULT 'Payment due within 30 days.',
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (owner_id) REFERENCES customers(id),
        FOREIGN KEY (crm_customer_id) REFERENCES crm_customers(id)
      )
    `).run()

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS crm_invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER NOT NULL,
        description TEXT NOT NULL, quantity REAL DEFAULT 1, unit_price REAL DEFAULT 0,
        amount REAL DEFAULT 0, sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (invoice_id) REFERENCES crm_invoices(id) ON DELETE CASCADE
      )
    `).run()

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS crm_proposals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        crm_customer_id INTEGER NOT NULL,
        proposal_number TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL, property_address TEXT,
        scope_of_work TEXT, materials_detail TEXT,
        labor_cost REAL DEFAULT 0, material_cost REAL DEFAULT 0, other_cost REAL DEFAULT 0,
        total_amount REAL DEFAULT 0,
        status TEXT DEFAULT 'draft',
        valid_until TEXT, notes TEXT,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (owner_id) REFERENCES customers(id),
        FOREIGN KEY (crm_customer_id) REFERENCES crm_customers(id)
      )
    `).run()

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS crm_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        crm_customer_id INTEGER,
        proposal_id INTEGER,
        job_number TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL, property_address TEXT,
        job_type TEXT DEFAULT 'install',
        scheduled_date TEXT NOT NULL, scheduled_time TEXT,
        estimated_duration TEXT, crew_size INTEGER,
        status TEXT DEFAULT 'scheduled',
        completed_date TEXT, notes TEXT,
        created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (owner_id) REFERENCES customers(id),
        FOREIGN KEY (crm_customer_id) REFERENCES crm_customers(id),
        FOREIGN KEY (proposal_id) REFERENCES crm_proposals(id)
      )
    `).run()

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS crm_job_checklist (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        label TEXT NOT NULL,
        is_completed INTEGER DEFAULT 0,
        completed_at TEXT, notes TEXT,
        sort_order INTEGER DEFAULT 0,
        FOREIGN KEY (job_id) REFERENCES crm_jobs(id) ON DELETE CASCADE
      )
    `).run()

    const crmIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_crm_customers_owner ON crm_customers(owner_id)',
      'CREATE INDEX IF NOT EXISTS idx_crm_invoices_owner ON crm_invoices(owner_id)',
      'CREATE INDEX IF NOT EXISTS idx_crm_invoices_customer ON crm_invoices(crm_customer_id)',
      'CREATE INDEX IF NOT EXISTS idx_crm_invoices_status ON crm_invoices(status)',
      'CREATE INDEX IF NOT EXISTS idx_crm_proposals_owner ON crm_proposals(owner_id)',
      'CREATE INDEX IF NOT EXISTS idx_crm_proposals_status ON crm_proposals(status)',
      'CREATE INDEX IF NOT EXISTS idx_crm_jobs_owner ON crm_jobs(owner_id)',
      'CREATE INDEX IF NOT EXISTS idx_crm_jobs_date ON crm_jobs(scheduled_date)',
      'CREATE INDEX IF NOT EXISTS idx_crm_jobs_status ON crm_jobs(status)',
      'CREATE INDEX IF NOT EXISTS idx_crm_job_checklist_job ON crm_job_checklist(job_id)'
    ]

    // Migration 0013: Email verification codes table
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS email_verification_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        code TEXT NOT NULL,
        verification_token TEXT,
        used INTEGER DEFAULT 0,
        verified_at TEXT,
        expires_at TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run()
    try { await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON email_verification_codes(email)').run() } catch(e) {}
    try { await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_verification_codes_token ON email_verification_codes(verification_token)').run() } catch(e) {}

    // Migration 0012: Proposal view tracking columns
    const proposalTrackingCols = [
      'view_count INTEGER DEFAULT 0',
      'last_viewed_at TEXT',
      'share_token TEXT',
      'sent_at TEXT'
    ]
    for (const col of proposalTrackingCols) {
      try { await c.env.DB.prepare(`ALTER TABLE crm_proposals ADD COLUMN ${col}`).run() } catch(e) {}
    }
    try { await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_crm_proposals_share_token ON crm_proposals(share_token)').run() } catch(e) {}
    for (const idx of crmIndexes) {
      try { await c.env.DB.prepare(idx).run() } catch(e) {}
    }

    return c.json({ success: true, message: 'Database initialized successfully' })
  } catch (err: any) {
    return c.json({ error: 'Failed to initialize database', details: err.message }, 500)
  }
})

// ============================================================
// SUPER ADMIN DASHBOARD ENDPOINTS
// ============================================================

// 1. All Active Users — full user list with account info
adminRoutes.get('/superadmin/users', async (c) => {
  try {
    const users = await c.env.DB.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) as order_count,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.is_trial = 1) as trial_orders,
        (SELECT COALESCE(SUM(o.price), 0) FROM orders o WHERE o.customer_id = c.id AND o.payment_status = 'paid' AND (o.is_trial IS NULL OR o.is_trial = 0)) as total_spent,
        (SELECT MAX(o.created_at) FROM orders o WHERE o.customer_id = c.id) as last_order_date,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.status = 'completed') as completed_reports
      FROM customers c
      ORDER BY c.created_at DESC
    `).all()

    const summary = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_users,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN google_id IS NOT NULL THEN 1 ELSE 0 END) as google_users,
        SUM(CASE WHEN report_credits > 0 OR credits_used > 0 THEN 1 ELSE 0 END) as paying_users,
        SUM(report_credits) as total_credits_available,
        SUM(credits_used) as total_credits_used,
        SUM(free_trial_used) as total_trial_used,
        SUM(free_trial_total) as total_trial_available
      FROM customers
    `).first()

    return c.json({ users: users.results, summary })
  } catch (err: any) {
    return c.json({ error: 'Failed to load users', details: err.message }, 500)
  }
})

// 2. Credit Pack Sales — with period filter (daily/weekly/monthly)
adminRoutes.get('/superadmin/sales', async (c) => {
  try {
    const period = c.req.query('period') || 'monthly' // daily, weekly, monthly

    let dateFilter = ''
    let groupBy = ''
    let orderBy = ''
    if (period === 'daily') {
      dateFilter = "WHERE sp.created_at >= date('now', '-30 days')"
      groupBy = "strftime('%Y-%m-%d', sp.created_at)"
      orderBy = "period DESC"
    } else if (period === 'weekly') {
      dateFilter = "WHERE sp.created_at >= date('now', '-12 weeks')"
      groupBy = "strftime('%Y-W%W', sp.created_at)"
      orderBy = "period DESC"
    } else {
      dateFilter = "WHERE sp.created_at >= date('now', '-12 months')"
      groupBy = "strftime('%Y-%m', sp.created_at)"
      orderBy = "period DESC"
    }

    // Individual credit pack purchases (from square_payments)
    const salesByPeriod = await c.env.DB.prepare(`
      SELECT ${groupBy} as period,
        COUNT(*) as transactions,
        SUM(sp.amount) as total_cents,
        SUM(CASE WHEN sp.status = 'succeeded' THEN sp.amount ELSE 0 END) as paid_cents
      FROM square_payments sp
      ${dateFilter}
      GROUP BY ${groupBy}
      ORDER BY ${orderBy}
    `).all()

    // Per-report order sales (non-trial)
    const orderSalesByPeriod = await c.env.DB.prepare(`
      SELECT ${groupBy.replace(/sp\./g, 'o.')} as period,
        COUNT(*) as orders,
        SUM(o.price) as total_value,
        SUM(CASE WHEN o.payment_status = 'paid' THEN o.price ELSE 0 END) as paid_value,
        SUM(CASE WHEN o.is_trial = 1 THEN 1 ELSE 0 END) as trial_count
      FROM orders o
      ${dateFilter.replace(/sp\./g, 'o.')}
      GROUP BY ${groupBy.replace(/sp\./g, 'o.')}
      ORDER BY ${orderBy}
    `).all()

    // Credit packages info
    const packages = await c.env.DB.prepare(`
      SELECT * FROM credit_packages WHERE is_active = 1 ORDER BY sort_order
    `).all()

    // Recent individual transactions
    const recentSales = await c.env.DB.prepare(`
      SELECT sp.*, c.name as customer_name, c.email as customer_email, c.company_name
      FROM square_payments sp
      LEFT JOIN customers c ON sp.customer_id = c.id
      ORDER BY sp.created_at DESC
      LIMIT 50
    `).all()

    // Summary totals
    const totals = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_transactions,
        SUM(amount) as total_cents,
        SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END) as paid_cents
      FROM square_payments
    `).first()

    const orderTotals = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_orders,
        SUM(price) as total_value,
        SUM(CASE WHEN payment_status = 'paid' AND (is_trial IS NULL OR is_trial = 0) THEN price ELSE 0 END) as paid_value,
        SUM(CASE WHEN is_trial = 1 THEN 1 ELSE 0 END) as trial_orders
      FROM orders
    `).first()

    return c.json({
      period,
      credit_sales_by_period: salesByPeriod.results,
      order_sales_by_period: orderSalesByPeriod.results,
      packages: packages.results,
      recent_sales: recentSales.results,
      credit_totals: totals,
      order_totals: orderTotals
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to load sales', details: err.message }, 500)
  }
})

// 3. Order History & Logistics — with report completion time
adminRoutes.get('/superadmin/orders', async (c) => {
  try {
    const limit = parseInt(c.req.query('limit') || '100')
    const offset = parseInt(c.req.query('offset') || '0')
    const status = c.req.query('status') || ''

    let whereClause = ''
    if (status) whereClause = `WHERE o.status = '${status}'`

    const orders = await c.env.DB.prepare(`
      SELECT o.*,
        c.name as customer_name, c.email as customer_email, c.company_name as customer_company,
        r.status as report_status, r.created_at as report_started_at, r.updated_at as report_completed_at,
        r.gross_squares, r.confidence_score, r.complexity_class,
        CASE 
          WHEN r.updated_at IS NOT NULL AND r.created_at IS NOT NULL 
          THEN CAST((julianday(r.updated_at) - julianday(r.created_at)) * 86400 AS INTEGER)
          ELSE NULL 
        END as processing_seconds
      FROM orders o
      LEFT JOIN customers c ON o.customer_id = c.id
      LEFT JOIN reports r ON r.order_id = o.id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(limit, offset).all()

    const counts = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        AVG(price) as avg_price,
        SUM(CASE WHEN is_trial = 1 THEN 1 ELSE 0 END) as trial_orders
      FROM orders
    `).first()

    // Average processing time (for completed reports)
    const avgTime = await c.env.DB.prepare(`
      SELECT AVG(
        CAST((julianday(r.updated_at) - julianday(r.created_at)) * 86400 AS INTEGER)
      ) as avg_seconds
      FROM reports r
      WHERE r.status = 'completed' AND r.updated_at IS NOT NULL AND r.created_at IS NOT NULL
    `).first()

    return c.json({
      orders: orders.results,
      counts,
      avg_processing_seconds: avgTime?.avg_seconds || 0,
      limit, offset
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to load orders', details: err.message }, 500)
  }
})

// 4. New User Sign-ups — with period filter
adminRoutes.get('/superadmin/signups', async (c) => {
  try {
    const period = c.req.query('period') || 'monthly'

    let groupBy = ''
    let dateFilter = ''
    if (period === 'daily') {
      groupBy = "strftime('%Y-%m-%d', created_at)"
      dateFilter = "WHERE created_at >= date('now', '-30 days')"
    } else if (period === 'weekly') {
      groupBy = "strftime('%Y-W%W', created_at)"
      dateFilter = "WHERE created_at >= date('now', '-12 weeks')"
    } else {
      groupBy = "strftime('%Y-%m', created_at)"
      dateFilter = "WHERE created_at >= date('now', '-12 months')"
    }

    const signupsByPeriod = await c.env.DB.prepare(`
      SELECT ${groupBy} as period,
        COUNT(*) as signups,
        SUM(CASE WHEN google_id IS NOT NULL THEN 1 ELSE 0 END) as google_signups,
        SUM(CASE WHEN google_id IS NULL THEN 1 ELSE 0 END) as email_signups
      FROM customers
      ${dateFilter}
      GROUP BY ${groupBy}
      ORDER BY period DESC
    `).all()

    const recentSignups = await c.env.DB.prepare(`
      SELECT c.*,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) as order_count,
        (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id AND o.is_trial = 1) as trial_orders
      FROM customers c
      ORDER BY c.created_at DESC
      LIMIT 30
    `).all()

    const summary = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_all_time,
        SUM(CASE WHEN created_at >= date('now') THEN 1 ELSE 0 END) as today,
        SUM(CASE WHEN created_at >= date('now', '-7 days') THEN 1 ELSE 0 END) as this_week,
        SUM(CASE WHEN strftime('%Y-%m', created_at) = strftime('%Y-%m', 'now') THEN 1 ELSE 0 END) as this_month,
        SUM(CASE WHEN google_id IS NOT NULL THEN 1 ELSE 0 END) as google_total,
        SUM(CASE WHEN google_id IS NULL THEN 1 ELSE 0 END) as email_total
      FROM customers
    `).first()

    return c.json({
      period,
      signups_by_period: signupsByPeriod.results,
      recent_signups: recentSignups.results,
      summary
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to load signups', details: err.message }, 500)
  }
})

// 5. Internal Sales & Marketing — proposals, invoices, leads, campaigns
adminRoutes.get('/superadmin/marketing', async (c) => {
  try {
    // CRM aggregate across all users
    const crmStats = await c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM crm_customers) as total_leads,
        (SELECT COUNT(*) FROM crm_customers WHERE status = 'active') as active_leads,
        (SELECT COUNT(*) FROM crm_proposals) as total_proposals,
        (SELECT COUNT(*) FROM crm_proposals WHERE status = 'draft') as draft_proposals,
        (SELECT COUNT(*) FROM crm_proposals WHERE status = 'sent') as sent_proposals,
        (SELECT COUNT(*) FROM crm_proposals WHERE status = 'sold') as sold_proposals,
        (SELECT COALESCE(SUM(total_amount), 0) FROM crm_proposals WHERE status = 'sold') as sold_value,
        (SELECT COALESCE(SUM(total_amount), 0) FROM crm_proposals) as total_proposal_value,
        (SELECT COUNT(*) FROM crm_invoices) as total_invoices,
        (SELECT COUNT(*) FROM crm_invoices WHERE status = 'paid') as paid_invoices,
        (SELECT COALESCE(SUM(total), 0) FROM crm_invoices WHERE status = 'paid') as paid_invoice_value,
        (SELECT COALESCE(SUM(total), 0) FROM crm_invoices WHERE status IN ('sent','viewed','overdue')) as outstanding_invoice_value,
        (SELECT COUNT(*) FROM crm_jobs) as total_jobs,
        (SELECT COUNT(*) FROM crm_jobs WHERE status = 'scheduled') as scheduled_jobs,
        (SELECT COUNT(*) FROM crm_jobs WHERE status = 'completed') as completed_jobs
    `).first()

    // Platform-level invoice stats (admin invoices, not CRM)
    const platformInvoices = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'paid' THEN total ELSE 0 END) as paid_value,
        SUM(CASE WHEN status IN ('sent','viewed') THEN total ELSE 0 END) as outstanding_value,
        SUM(CASE WHEN status = 'overdue' THEN total ELSE 0 END) as overdue_value
      FROM invoices
    `).first()

    // Recent proposals
    const recentProposals = await c.env.DB.prepare(`
      SELECT p.*, cc.name as customer_name, c.name as owner_name, c.email as owner_email
      FROM crm_proposals p
      LEFT JOIN crm_customers cc ON p.crm_customer_id = cc.id
      LEFT JOIN customers c ON p.owner_id = c.id
      ORDER BY p.created_at DESC LIMIT 20
    `).all()

    // Recent CRM invoices
    const recentInvoices = await c.env.DB.prepare(`
      SELECT i.*, cc.name as customer_name, c.name as owner_name
      FROM crm_invoices i
      LEFT JOIN crm_customers cc ON i.crm_customer_id = cc.id
      LEFT JOIN customers c ON i.owner_id = c.id
      ORDER BY i.created_at DESC LIMIT 20
    `).all()

    // Conversion funnel: signups → trial → paid
    const funnel = await c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM customers) as total_signups,
        (SELECT COUNT(*) FROM customers WHERE free_trial_used > 0) as used_trial,
        (SELECT COUNT(*) FROM customers WHERE report_credits > 0 OR credits_used > 0) as became_paid,
        (SELECT COUNT(*) FROM orders WHERE is_trial = 1) as trial_reports,
        (SELECT COUNT(*) FROM orders WHERE is_trial = 0 OR is_trial IS NULL) as paid_reports
    `).first()

    return c.json({
      crm_stats: crmStats,
      platform_invoices: platformInvoices,
      recent_proposals: recentProposals.results,
      recent_invoices: recentInvoices.results,
      funnel
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to load marketing data', details: err.message }, 500)
  }
})

// ============================================================
// SUPERADMIN: ROOFER SECRETARY AI — Subscriber management, usage, revenue
// ============================================================

// GET /superadmin/secretary/overview — Full overview of all secretary subscribers
adminRoutes.get('/superadmin/secretary/overview', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin || !requireSuperadmin(admin)) return c.json({ error: 'Superadmin required' }, 403)
  try {
    // Subscription stats
    const subStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_subscriptions,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_count,
        SUM(CASE WHEN status = 'past_due' THEN 1 ELSE 0 END) as past_due_count,
        SUM(CASE WHEN status = 'active' THEN monthly_price_cents ELSE 0 END) as monthly_mrr_cents
      FROM secretary_subscriptions
    `).first<any>()

    // Call stats
    const callStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_calls,
        SUM(call_duration_seconds) as total_seconds,
        AVG(call_duration_seconds) as avg_duration,
        SUM(CASE WHEN call_outcome = 'answered' THEN 1 ELSE 0 END) as answered,
        SUM(CASE WHEN call_outcome = 'voicemail' THEN 1 ELSE 0 END) as voicemail,
        SUM(CASE WHEN call_outcome = 'transferred' THEN 1 ELSE 0 END) as transferred,
        SUM(CASE WHEN call_outcome = 'missed' THEN 1 ELSE 0 END) as missed
      FROM secretary_call_logs
    `).first<any>()

    // Calls in last 30 days
    const recentCallStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as calls_30d,
        SUM(call_duration_seconds) as seconds_30d,
        COUNT(DISTINCT customer_id) as active_users_30d
      FROM secretary_call_logs
      WHERE created_at >= datetime('now', '-30 days')
    `).first<any>()

    // Calls in last 7 days
    const weekCallStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as calls_7d,
        SUM(call_duration_seconds) as seconds_7d,
        COUNT(DISTINCT customer_id) as active_users_7d
      FROM secretary_call_logs
      WHERE created_at >= datetime('now', '-7 days')
    `).first<any>()

    // Config stats (active service users)
    const configStats = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_configs,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_services
      FROM secretary_config
    `).first<any>()

    // Messages & appointments
    const msgStats = await c.env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM secretary_messages) as total_messages,
        (SELECT COUNT(*) FROM secretary_messages WHERE is_read = 0) as unread_messages,
        (SELECT COUNT(*) FROM secretary_appointments) as total_appointments,
        (SELECT COUNT(*) FROM secretary_appointments WHERE status = 'pending') as pending_appointments,
        (SELECT COUNT(*) FROM secretary_callbacks) as total_callbacks,
        (SELECT COUNT(*) FROM secretary_callbacks WHERE status = 'pending') as pending_callbacks
    `).first<any>()

    return c.json({
      subscriptions: subStats || {},
      calls: callStats || {},
      recent_calls: recentCallStats || {},
      week_calls: weekCallStats || {},
      configs: configStats || {},
      messages: msgStats || {}
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to load secretary overview', details: err.message }, 500)
  }
})

// GET /superadmin/secretary/subscribers — All subscribers with details
adminRoutes.get('/superadmin/secretary/subscribers', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin || !requireSuperadmin(admin)) return c.json({ error: 'Superadmin required' }, 403)
  try {
    const subscribers = await c.env.DB.prepare(`
      SELECT 
        ss.id,
        ss.customer_id,
        ss.status,
        ss.stripe_subscription_id,
        ss.monthly_price_cents,
        ss.current_period_start,
        ss.current_period_end,
        ss.cancelled_at,
        ss.created_at,
        ss.updated_at,
        c.name as customer_name,
        c.email as customer_email,
        c.phone as customer_phone,
        c.company as customer_company,
        sc.business_phone,
        sc.is_active as service_active,
        sc.greeting_script,
        (SELECT COUNT(*) FROM secretary_call_logs cl WHERE cl.customer_id = ss.customer_id) as total_calls,
        (SELECT SUM(call_duration_seconds) FROM secretary_call_logs cl WHERE cl.customer_id = ss.customer_id) as total_call_seconds,
        (SELECT COUNT(*) FROM secretary_call_logs cl WHERE cl.customer_id = ss.customer_id AND cl.created_at >= datetime('now', '-30 days')) as calls_30d,
        (SELECT SUM(call_duration_seconds) FROM secretary_call_logs cl WHERE cl.customer_id = ss.customer_id AND cl.created_at >= datetime('now', '-30 days')) as seconds_30d,
        (SELECT COUNT(*) FROM secretary_messages m WHERE m.customer_id = ss.customer_id) as total_messages,
        (SELECT COUNT(*) FROM secretary_appointments a WHERE a.customer_id = ss.customer_id) as total_appointments
      FROM secretary_subscriptions ss
      LEFT JOIN customers c ON c.id = ss.customer_id
      LEFT JOIN secretary_config sc ON sc.customer_id = ss.customer_id
      ORDER BY ss.created_at DESC
    `).all()

    return c.json({ subscribers: subscribers.results || [] })
  } catch (err: any) {
    return c.json({ error: 'Failed to load subscribers', details: err.message }, 500)
  }
})

// GET /superadmin/secretary/revenue — Revenue analytics & subscription lifecycle
adminRoutes.get('/superadmin/secretary/revenue', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin || !requireSuperadmin(admin)) return c.json({ error: 'Superadmin required' }, 403)
  try {
    const period = c.req.query('period') || 'monthly'
    let dateFormat: string, dateFilter: string
    if (period === 'weekly') {
      dateFormat = '%Y-W%W'
      dateFilter = "datetime('now', '-90 days')"
    } else if (period === 'daily') {
      dateFormat = '%Y-%m-%d'
      dateFilter = "datetime('now', '-30 days')"
    } else {
      dateFormat = '%Y-%m'
      dateFilter = "datetime('now', '-12 months')"
    }

    // Revenue over time (from subscriptions)
    const revenueByPeriod = await c.env.DB.prepare(`
      SELECT 
        strftime('${dateFormat}', ss.created_at) as period,
        COUNT(*) as new_subs,
        SUM(monthly_price_cents) as revenue_cents
      FROM secretary_subscriptions ss
      WHERE ss.created_at >= ${dateFilter}
      GROUP BY period
      ORDER BY period ASC
    `).all()

    // Current MRR breakdown
    const mrr = await c.env.DB.prepare(`
      SELECT
        SUM(CASE WHEN status = 'active' THEN monthly_price_cents ELSE 0 END) as active_mrr_cents,
        SUM(CASE WHEN status = 'past_due' THEN monthly_price_cents ELSE 0 END) as at_risk_mrr_cents,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as churned_count,
        COUNT(CASE WHEN status = 'past_due' THEN 1 END) as at_risk_count
      FROM secretary_subscriptions
    `).first<any>()

    // Upcoming renewals (subscriptions expiring in next 30 days)
    const upcomingRenewals = await c.env.DB.prepare(`
      SELECT 
        ss.id,
        ss.customer_id,
        ss.status,
        ss.monthly_price_cents,
        ss.current_period_end,
        c.name as customer_name,
        c.email as customer_email,
        c.company as customer_company
      FROM secretary_subscriptions ss
      LEFT JOIN customers c ON c.id = ss.customer_id
      WHERE ss.status = 'active'
        AND ss.current_period_end IS NOT NULL
        AND ss.current_period_end <= datetime('now', '+30 days')
      ORDER BY ss.current_period_end ASC
    `).all()

    // Expired/past-due subscriptions
    const expired = await c.env.DB.prepare(`
      SELECT 
        ss.id,
        ss.customer_id,
        ss.status,
        ss.monthly_price_cents,
        ss.current_period_end,
        ss.cancelled_at,
        c.name as customer_name,
        c.email as customer_email,
        c.company as customer_company
      FROM secretary_subscriptions ss
      LEFT JOIN customers c ON c.id = ss.customer_id
      WHERE ss.status IN ('past_due', 'cancelled')
      ORDER BY ss.updated_at DESC
      LIMIT 50
    `).all()

    // Lifetime revenue
    const lifetime = await c.env.DB.prepare(`
      SELECT 
        SUM(monthly_price_cents) as total_lifetime_cents,
        COUNT(*) as total_subscriptions_ever,
        MIN(created_at) as first_subscription
      FROM secretary_subscriptions
      WHERE status IN ('active', 'cancelled', 'past_due')
    `).first<any>()

    return c.json({
      revenue_by_period: revenueByPeriod.results || [],
      mrr: mrr || {},
      upcoming_renewals: upcomingRenewals.results || [],
      expired: expired.results || [],
      lifetime: lifetime || {},
      period
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to load revenue data', details: err.message }, 500)
  }
})

// GET /superadmin/secretary/calls — Recent call logs across all subscribers
adminRoutes.get('/superadmin/secretary/calls', async (c) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin || !requireSuperadmin(admin)) return c.json({ error: 'Superadmin required' }, 403)
  try {
    const limit = parseInt(c.req.query('limit') || '50')
    const offset = parseInt(c.req.query('offset') || '0')
    const customerId = c.req.query('customer_id')
    
    let whereClause = ''
    const params: any[] = []
    if (customerId) {
      whereClause = 'WHERE cl.customer_id = ?'
      params.push(parseInt(customerId))
    }

    const calls = await c.env.DB.prepare(`
      SELECT 
        cl.*,
        c.name as customer_name,
        c.email as customer_email,
        c.company as customer_company
      FROM secretary_call_logs cl
      LEFT JOIN customers c ON c.id = cl.customer_id
      ${whereClause}
      ORDER BY cl.created_at DESC
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all()

    const totalRes = await c.env.DB.prepare(`
      SELECT COUNT(*) as count FROM secretary_call_logs cl ${whereClause}
    `).bind(...params).first<any>()

    return c.json({
      calls: calls.results || [],
      total: totalRes?.count || 0,
      limit,
      offset
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to load call logs', details: err.message }, 500)
  }
})

// ============================================================
// SEO MANAGER — Page meta tags and backlinks
// ============================================================

// Ensure SEO tables exist
async function ensureSEOTables(db: D1Database) {
  try {
    await db.prepare(`CREATE TABLE IF NOT EXISTS seo_page_meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_key TEXT UNIQUE NOT NULL,
      meta_title TEXT, meta_description TEXT, canonical_url TEXT,
      keywords TEXT, og_image TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    )`).run()
    await db.prepare(`CREATE TABLE IF NOT EXISTS seo_backlinks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_page TEXT NOT NULL DEFAULT 'all',
      url TEXT NOT NULL, anchor_text TEXT,
      nofollow INTEGER DEFAULT 0, new_window INTEGER DEFAULT 1,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`).run()
  } catch(e) {}
}

// POST /superadmin/seo/page-meta — Save meta tags for a page
adminRoutes.post('/superadmin/seo/page-meta', async (c) => {
  await ensureSEOTables(c.env.DB)
  const { page, meta_title, meta_description, canonical_url, keywords, og_image } = await c.req.json()
  if (!page) return c.json({ error: 'Page key is required' }, 400)
  
  await c.env.DB.prepare(`INSERT INTO seo_page_meta (page_key, meta_title, meta_description, canonical_url, keywords, og_image, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(page_key) DO UPDATE SET meta_title=excluded.meta_title, meta_description=excluded.meta_description,
    canonical_url=excluded.canonical_url, keywords=excluded.keywords, og_image=excluded.og_image, updated_at=datetime('now')
  `).bind(page, meta_title || '', meta_description || '', canonical_url || '', keywords || '', og_image || '').run()
  
  return c.json({ success: true })
})

// GET /superadmin/seo/page-meta?page=homepage
adminRoutes.get('/superadmin/seo/page-meta', async (c) => {
  await ensureSEOTables(c.env.DB)
  const page = c.req.query('page')
  if (page) {
    const meta = await c.env.DB.prepare('SELECT * FROM seo_page_meta WHERE page_key = ?').bind(page).first()
    return c.json({ meta: meta || null })
  }
  const { results } = await c.env.DB.prepare('SELECT * FROM seo_page_meta ORDER BY page_key').all()
  return c.json({ pages: results })
})

// POST /superadmin/seo/backlinks — Add a backlink
adminRoutes.post('/superadmin/seo/backlinks', async (c) => {
  await ensureSEOTables(c.env.DB)
  const { target_page, url, anchor_text, nofollow, new_window } = await c.req.json()
  if (!url) return c.json({ error: 'URL is required' }, 400)
  
  await c.env.DB.prepare(
    `INSERT INTO seo_backlinks (target_page, url, anchor_text, nofollow, new_window) VALUES (?, ?, ?, ?, ?)`
  ).bind(target_page || 'all', url, anchor_text || '', nofollow ? 1 : 0, new_window !== false ? 1 : 0).run()
  
  return c.json({ success: true })
})

// GET /superadmin/seo/backlinks — List all backlinks
adminRoutes.get('/superadmin/seo/backlinks', async (c) => {
  await ensureSEOTables(c.env.DB)
  const { results } = await c.env.DB.prepare('SELECT * FROM seo_backlinks WHERE is_active = 1 ORDER BY created_at DESC').all()
  return c.json({ backlinks: results })
})

// DELETE /superadmin/seo/backlinks/:id
adminRoutes.delete('/superadmin/seo/backlinks/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('UPDATE seo_backlinks SET is_active = 0 WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============================================================
// CANVA INTEGRATION — Design templates for invoices/proposals
// ============================================================

// Save Canva API key
adminRoutes.post('/canva/connect', async (c) => {
  const { canva_api_key, canva_brand_template_id } = await c.req.json()
  if (!canva_api_key) return c.json({ error: 'Canva API key is required' }, 400)

  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO settings (master_company_id, setting_key, setting_value) VALUES (1, 'canva_api_key', ?)
  `).bind(canva_api_key).run()

  if (canva_brand_template_id) {
    await c.env.DB.prepare(`
      INSERT OR REPLACE INTO settings (master_company_id, setting_key, setting_value) VALUES (1, 'canva_brand_template_id', ?)
    `).bind(canva_brand_template_id).run()
  }

  return c.json({ success: true, message: 'Canva connected successfully' })
})

// Get Canva status
adminRoutes.get('/canva/status', async (c) => {
  const apiKey = await c.env.DB.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'canva_api_key' AND master_company_id = 1"
  ).first<any>()

  const templateId = await c.env.DB.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'canva_brand_template_id' AND master_company_id = 1"
  ).first<any>()

  // Get saved templates
  const templates = await c.env.DB.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'canva_templates' AND master_company_id = 1"
  ).first<any>()

  let savedTemplates: any[] = []
  if (templates?.setting_value) {
    try { savedTemplates = JSON.parse(templates.setting_value) } catch {}
  }

  return c.json({
    connected: !!apiKey?.setting_value,
    has_brand_template: !!templateId?.setting_value,
    templates: savedTemplates,
    canva_design_url: 'https://www.canva.com/design',
    instructions: {
      step_1: 'Create a free Canva account at canva.com',
      step_2: 'Design your invoice/proposal/estimate template',
      step_3: 'Use Canva Connect API or paste your design URL here',
      step_4: 'Templates will be used when generating customer documents',
      note: 'Canva Connect API requires a Canva for Teams subscription for full API access. Free users can paste design URLs for manual integration.'
    }
  })
})

// Save Canva design template URLs
adminRoutes.post('/canva/templates', async (c) => {
  const { templates } = await c.req.json()
  // templates = [{ name: 'Invoice Template', type: 'invoice', canva_url: 'https://...', thumbnail_url: '' }]
  
  if (!Array.isArray(templates)) return c.json({ error: 'templates must be an array' }, 400)

  await c.env.DB.prepare(`
    INSERT OR REPLACE INTO settings (master_company_id, setting_key, setting_value) VALUES (1, 'canva_templates', ?)
  `).bind(JSON.stringify(templates)).run()

  return c.json({ success: true, count: templates.length })
})

// Generate a Canva design from template (creates a copy for customization)
adminRoutes.post('/canva/generate', async (c) => {
  const { template_type, customer_name, property_address, total_amount } = await c.req.json()

  // Load Canva API key
  const apiKeyRow = await c.env.DB.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'canva_api_key' AND master_company_id = 1"
  ).first<any>()

  if (!apiKeyRow?.setting_value) {
    return c.json({
      error: 'Canva API not configured',
      fallback: 'Use the built-in HTML invoice generator or paste a Canva design URL',
      instructions: 'Go to Admin Settings → Canva Integration → Connect your Canva API key'
    }, 400)
  }

  // Try Canva Connect API to create an autofill design
  try {
    const resp = await fetch('https://api.canva.com/rest/v1/autofills', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKeyRow.setting_value}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        brand_template_id: template_type || 'default',
        data: {
          customer_name: customer_name || '',
          property_address: property_address || '',
          total_amount: total_amount ? `$${parseFloat(total_amount).toFixed(2)}` : '',
          date: new Date().toLocaleDateString('en-CA'),
          company_name: 'RoofReporterAI'
        }
      })
    })

    if (resp.ok) {
      const result = await resp.json()
      return c.json({ success: true, design: result })
    } else {
      const err = await resp.text()
      return c.json({
        error: 'Canva API error',
        details: err,
        fallback: 'You can manually open your Canva template and customize it'
      }, 400)
    }
  } catch (err: any) {
    return c.json({
      error: 'Canva API unavailable',
      details: err.message,
      fallback: 'Use the built-in HTML invoice generator instead'
    }, 500)
  }
})

// ============================================================
// PAYWALL / APP STORE READINESS CHECK
// ============================================================
adminRoutes.get('/superadmin/paywall-status', async (c) => {
  // Check all payment/subscription infrastructure
  const squareToken = !!(c.env as any).SQUARE_ACCESS_TOKEN
  const squareLocation = !!(c.env as any).SQUARE_LOCATION_ID
  const stripeKey = !!(c.env as any).STRIPE_SECRET_KEY

  const creditPackages = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM credit_packages WHERE is_active = 1'
  ).first<any>()

  const pricingConfig = await c.env.DB.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'subscription_monthly_price_cents' AND master_company_id = 1"
  ).first<any>()

  const hasSubscriptionPricing = !!(pricingConfig?.setting_value && parseInt(pricingConfig.setting_value) > 0)

  const checks = {
    payment_gateway: {
      square_configured: squareToken && squareLocation,
      stripe_configured: !!stripeKey,
      any_payment_active: squareToken || !!stripeKey,
    },
    subscription_model: {
      has_pricing: hasSubscriptionPricing,
      has_credit_packages: (creditPackages?.count || 0) > 0,
      monthly_price_cents: parseInt(pricingConfig?.setting_value || '0'),
    },
    app_store_requirements: {
      payment_gateway_active: squareToken || !!stripeKey,
      subscription_pricing_set: hasSubscriptionPricing,
      free_trial_enabled: true, // 3 free reports default
      user_auth_system: true, // Google OAuth + email
      terms_of_service: false, // TODO: needs legal review
      privacy_policy: false, // TODO: needs legal review
      app_store_listing: false, // TODO: not submitted yet
    },
    overall_ready: false,
    missing_for_launch: [] as string[],
  }

  // Determine what's missing
  if (!checks.payment_gateway.any_payment_active) checks.missing_for_launch.push('Configure Square or Stripe payment gateway')
  if (!checks.subscription_model.has_pricing) checks.missing_for_launch.push('Set subscription pricing (monthly/annual)')
  if (!checks.app_store_requirements.terms_of_service) checks.missing_for_launch.push('Add Terms of Service page')
  if (!checks.app_store_requirements.privacy_policy) checks.missing_for_launch.push('Add Privacy Policy page')
  if (!checks.app_store_requirements.app_store_listing) checks.missing_for_launch.push('Create App Store listing')

  checks.overall_ready = checks.missing_for_launch.length === 0

  return c.json(checks)
})

// ============================================================
// TELEPHONY / LIVEKIT — Configuration & Management
// ============================================================

// GET /superadmin/telephony-status — Get all telephony config
adminRoutes.get('/superadmin/telephony-status', async (c) => {
  const livekitUrl = (c.env as any).LIVEKIT_URL || ''
  const livekitKey = (c.env as any).LIVEKIT_API_KEY || ''
  const livekitSecret = (c.env as any).LIVEKIT_API_SECRET || ''

  // Load saved telephony config from DB
  const configs = await c.env.DB.prepare(
    "SELECT setting_key, setting_value FROM settings WHERE master_company_id = 1 AND setting_key LIKE 'telephony_%'"
  ).all<any>()

  const cfg: Record<string, string> = {}
  for (const row of configs.results || []) {
    cfg[row.setting_key.replace('telephony_', '')] = row.setting_value
  }

  // Load phone numbers
  let phoneNumbers: any[] = []
  try {
    const pnRows = await c.env.DB.prepare(
      "SELECT * FROM telephony_numbers WHERE is_active = 1 ORDER BY created_at DESC"
    ).all<any>()
    phoneNumbers = pnRows.results || []
  } catch { /* table may not exist yet */ }

  return c.json({
    livekit_configured: !!(livekitUrl && livekitKey),
    livekit_url: livekitUrl,
    livekit_api_key: livekitKey ? '••••' + livekitKey.slice(-4) : '',
    livekit_api_secret: livekitSecret ? true : false,
    sip_provider: cfg.sip_provider || 'twilio',
    business_number: cfg.business_number || '',
    forward_to_number: cfg.forward_to_number || '',
    forwarding_mode: cfg.forwarding_mode || 'always',
    business_hours_start: cfg.business_hours_start || '08:00',
    business_hours_end: cfg.business_hours_end || '17:00',
    sip_trunk_name: cfg.sip_trunk_name || 'RoofReporter-Inbound',
    sip_trunk_number: cfg.sip_trunk_number || '',
    sip_server_host: cfg.sip_server_host || '',
    sip_username: cfg.sip_username || '',
    sip_password: cfg.sip_password ? true : false,
    phone_numbers: phoneNumbers,
    phone_numbers_count: phoneNumbers.length,
    sip_trunk_count: cfg.sip_trunk_number ? 1 : 0,
    active_forwards: cfg.business_number && cfg.forward_to_number ? 1 : 0,
  })
})

// PUT /superadmin/telephony-config — Save LiveKit config
adminRoutes.put('/superadmin/telephony-config', async (c) => {
  const body = await c.req.json()
  const fields: Record<string, string> = {}
  if (body.sip_provider) fields.telephony_sip_provider = body.sip_provider

  // Save to settings table
  for (const [key, value] of Object.entries(fields)) {
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO settings (master_company_id, setting_key, setting_value) VALUES (1, ?, ?)"
    ).bind(key, value as string).run()
  }

  // Note: LiveKit URL/Key/Secret should be set via wrangler secret put
  // for production security. We'll save a note that they're configured.
  if (body.livekit_url) {
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO settings (master_company_id, setting_key, setting_value) VALUES (1, 'telephony_livekit_url_configured', ?)"
    ).bind(body.livekit_url).run()
  }

  return c.json({ success: true })
})

// PUT /superadmin/telephony-forwarding — Save call forwarding config
adminRoutes.put('/superadmin/telephony-forwarding', async (c) => {
  const body = await c.req.json()
  const fields: Record<string, string> = {
    telephony_business_number: body.business_number || '',
    telephony_forward_to_number: body.forward_to_number || '',
    telephony_forwarding_mode: body.forwarding_mode || 'always',
    telephony_business_hours_start: body.business_hours_start || '08:00',
    telephony_business_hours_end: body.business_hours_end || '17:00',
  }

  for (const [key, value] of Object.entries(fields)) {
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO settings (master_company_id, setting_key, setting_value) VALUES (1, ?, ?)"
    ).bind(key, value).run()
  }

  // Check if we can configure via API (Twilio/Telnyx)
  let apiConfigured = false
  const provider = body.sip_provider || 'manual'
  // For Twilio/Telnyx, API-based forwarding would be configured here
  // For TELUS/manual, user follows the instructions in the UI

  return c.json({ success: true, api_configured: apiConfigured, provider })
})

// PUT /superadmin/telephony-sip-trunk — Save SIP trunk config
adminRoutes.put('/superadmin/telephony-sip-trunk', async (c) => {
  const body = await c.req.json()
  const fields: Record<string, string> = {
    telephony_sip_trunk_name: body.sip_trunk_name || 'RoofReporter-Inbound',
    telephony_sip_trunk_number: body.sip_trunk_number || '',
    telephony_sip_server_host: body.sip_server_host || '',
    telephony_sip_username: body.sip_username || '',
  }
  if (body.sip_password) {
    fields.telephony_sip_password = body.sip_password
  }

  for (const [key, value] of Object.entries(fields)) {
    await c.env.DB.prepare(
      "INSERT OR REPLACE INTO settings (master_company_id, setting_key, setting_value) VALUES (1, ?, ?)"
    ).bind(key, value).run()
  }

  return c.json({ success: true })
})

// GET /superadmin/telephony-search-numbers — Search available numbers
adminRoutes.get('/superadmin/telephony-search-numbers', async (c) => {
  const areaCode = c.req.query('area_code') || '403'
  const type = c.req.query('type') || 'local'

  // In a full implementation, this would call Twilio/Telnyx API
  // For now, return sample numbers for the area code
  const sampleNumbers = [
    { number: '+1' + areaCode + '5550101', monthly_cost: '1.00', type },
    { number: '+1' + areaCode + '5550102', monthly_cost: '1.00', type },
    { number: '+1' + areaCode + '5550103', monthly_cost: '1.00', type },
    { number: '+1' + areaCode + '5550104', monthly_cost: '1.00', type },
    { number: '+1' + areaCode + '5550105', monthly_cost: '1.00', type },
  ]

  return c.json({
    numbers: sampleNumbers,
    note: 'Connect your Twilio/Telnyx API keys to search real available numbers.'
  })
})

// POST /superadmin/telephony-purchase-number — Purchase a number
adminRoutes.post('/superadmin/telephony-purchase-number', async (c) => {
  const { number } = await c.req.json()
  if (!number) return c.json({ error: 'Number is required' }, 400)

  // Create telephony_numbers table if needed
  await c.env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS telephony_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      number TEXT NOT NULL,
      label TEXT DEFAULT '',
      type TEXT DEFAULT 'local',
      provider TEXT DEFAULT 'manual',
      forwarding_active INTEGER DEFAULT 0,
      forward_to TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run()

  await c.env.DB.prepare(
    "INSERT INTO telephony_numbers (number, type, provider) VALUES (?, 'local', 'manual')"
  ).bind(number).run()

  return c.json({ success: true, number })
})

// POST /superadmin/telephony-sip-test — Test SIP connection
adminRoutes.post('/superadmin/telephony-sip-test', async (c) => {
  // Verify SIP trunk configuration exists
  const host = await c.env.DB.prepare(
    "SELECT setting_value FROM settings WHERE setting_key = 'telephony_sip_server_host' AND master_company_id = 1"
  ).first<any>()

  if (!host?.setting_value) {
    return c.json({ success: false, error: 'No SIP server host configured' })
  }

  // In production, we'd attempt an OPTIONS or REGISTER to the SIP server
  // For now, verify the config exists
  return c.json({ success: true, message: 'SIP configuration verified. Full connectivity test requires an active SIP trunk.' })
})

// ============================================================
// CUSTOMER ONBOARDING — Create accounts + set up Secretary AI
// ============================================================
adminRoutes.get('/superadmin/onboarding/list', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(`
      SELECT oc.*, c.name as account_name, c.email as account_email
      FROM onboarded_customers oc
      LEFT JOIN customers c ON c.id = oc.customer_id
      ORDER BY oc.created_at DESC LIMIT 100
    `).all<any>()
    return c.json({ customers: results || [] })
  } catch {
    return c.json({ customers: [] })
  }
})

adminRoutes.post('/superadmin/onboarding/create', async (c) => {
  const body = await c.req.json()
  const { business_name, contact_name, email, phone, password, secretary_phone_number, call_forwarding_number, secretary_mode, notes } = body

  if (!email || !password || !contact_name) {
    return c.json({ error: 'Email, password, and contact name are required' }, 400)
  }

  try {
    // Check if account already exists
    const existing = await c.env.DB.prepare('SELECT id FROM customers WHERE email = ?').bind(email).first<any>()
    if (existing) {
      return c.json({ error: 'An account with this email already exists', customer_id: existing.id }, 400)
    }

    // Create the customer account (roofer user)
    const { createHash } = await import('node:crypto')
    const passwordHash = createHash ? undefined : password // Workers don't have crypto.createHash
    // Use Web Crypto for password hashing
    const encoder = new TextEncoder()
    const data = encoder.encode(password + 'roofreporter_salt_2024')
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashedPassword = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    const result = await c.env.DB.prepare(`
      INSERT INTO customers (name, email, password, phone, role, tier, credits, is_active, created_at)
      VALUES (?, ?, ?, ?, 'admin', 'pro', 5, 1, datetime('now'))
    `).bind(contact_name, email, hashedPassword, phone || '').run()

    const customerId = result.meta.last_row_id as number

    // Set up branding
    if (business_name) {
      await c.env.DB.prepare(
        "UPDATE customers SET brand_business_name = ? WHERE id = ?"
      ).bind(business_name, customerId).run()
    }

    // Create secretary subscription entry if phone provided
    let secretarySetup = false
    if (secretary_phone_number) {
      try {
        await c.env.DB.prepare(`
          INSERT INTO secretary_subscriptions (customer_id, status, phone_number, mode, created_at)
          VALUES (?, 'active', ?, ?, datetime('now'))
        `).bind(customerId, secretary_phone_number, secretary_mode || 'receptionist').run()

        // Save secretary config
        await c.env.DB.prepare(`
          INSERT INTO secretary_config (customer_id, phone_number, forwarding_number, mode, greeting_text, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
          ON CONFLICT(customer_id) DO UPDATE SET phone_number = excluded.phone_number, forwarding_number = excluded.forwarding_number, mode = excluded.mode, is_active = 1, updated_at = datetime('now')
        `).bind(customerId, secretary_phone_number, call_forwarding_number || '', secretary_mode || 'receptionist',
          `Thank you for calling ${business_name || contact_name}. Our AI receptionist is here to help. How may I direct your call?`
        ).run()

        secretarySetup = true
      } catch (secErr: any) {
        console.error('[Onboarding] Secretary setup error:', secErr.message)
      }
    }

    // Track onboarding record
    await c.env.DB.prepare(`
      INSERT INTO onboarded_customers (customer_id, business_name, contact_name, email, phone, secretary_enabled, secretary_phone_number, secretary_mode, call_forwarding_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(customerId, business_name || '', contact_name, email, phone || '',
      secretarySetup ? 1 : 0, secretary_phone_number || '', secretary_mode || 'receptionist',
      call_forwarding_number || '', notes || ''
    ).run()

    // Create notification for the new customer
    await c.env.DB.prepare(
      "INSERT INTO notifications (owner_id, type, title, message, link) VALUES (?, 'welcome', ?, ?, '/settings')"
    ).bind(customerId,
      'Welcome to RoofReporterAI!',
      `Your account has been set up by our team. ${secretarySetup ? 'Your Roofer Secretary AI is active and ready to take calls!' : 'Log in to explore your dashboard.'}`
    ).run()

    return c.json({
      success: true,
      customer_id: customerId,
      email,
      secretary_setup: secretarySetup,
      login_url: '/login',
      message: `Account created for ${contact_name}. ${secretarySetup ? 'Secretary AI is active on ' + secretary_phone_number : 'Secretary can be set up later.'}`
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to create account: ' + err.message }, 500)
  }
})

// Toggle secretary AI on/off for onboarded customer
adminRoutes.post('/superadmin/onboarding/:id/toggle-secretary', async (c) => {
  const id = c.req.param('id')
  const { enabled } = await c.req.json()
  try {
    await c.env.DB.prepare(
      "UPDATE onboarded_customers SET secretary_enabled = ?, updated_at = datetime('now') WHERE id = ?"
    ).bind(enabled ? 1 : 0, id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: err.message }, 500)
  }
})

// ============================================================
// SERVICE INVOICES — Cold call invoicing (Secretary AI subscriptions, setup fees)
// ============================================================
adminRoutes.get('/superadmin/service-invoices', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM service_invoices ORDER BY created_at DESC LIMIT 100'
    ).all<any>()
    return c.json({ invoices: results || [] })
  } catch {
    return c.json({ invoices: [] })
  }
})

adminRoutes.post('/superadmin/service-invoices/create', async (c) => {
  const body = await c.req.json()
  const { customer_email, customer_name, customer_phone, items, notes, due_date } = body

  if (!customer_email || !items || !Array.isArray(items) || items.length === 0) {
    return c.json({ error: 'Customer email and at least one line item required' }, 400)
  }

  const invoiceNumber = 'SVC-' + new Date().toISOString().slice(0, 10).replace(/-/g, '') + '-' + Math.floor(Math.random() * 9999).toString().padStart(4, '0')
  const subtotal = items.reduce((sum: number, it: any) => sum + (parseFloat(it.price) || parseFloat(it.amount) || 0), 0)
  const taxRate = 5
  const taxAmount = Math.round(subtotal * taxRate / 100 * 100) / 100
  const total = Math.round((subtotal + taxAmount) * 100) / 100
  const dueDateStr = due_date || (() => { const d = new Date(); d.setDate(d.getDate() + 15); return d.toISOString().slice(0, 10) })()

  try {
    const result = await c.env.DB.prepare(`
      INSERT INTO service_invoices (invoice_number, customer_email, customer_name, customer_phone, items, subtotal, tax_rate, tax_amount, total, due_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(invoiceNumber, customer_email, customer_name || '', customer_phone || '',
      JSON.stringify(items), subtotal, taxRate, taxAmount, total,
      dueDateStr, notes || ''
    ).run()

    return c.json({
      success: true,
      id: result.meta.last_row_id,
      invoice_number: invoiceNumber,
      total,
      payment_link: `/service-invoice/${result.meta.last_row_id}`
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to create invoice: ' + err.message }, 500)
  }
})

adminRoutes.post('/superadmin/service-invoices/:id/send', async (c) => {
  const id = c.req.param('id')
  const invoice = await c.env.DB.prepare('SELECT * FROM service_invoices WHERE id = ?').bind(id).first<any>()
  if (!invoice) return c.json({ error: 'Invoice not found' }, 404)

  // Generate Square payment link
  const squareToken = (c.env as any).SQUARE_ACCESS_TOKEN
  const locationId = (c.env as any).SQUARE_LOCATION_ID
  let paymentLink = ''

  if (squareToken) {
    try {
      const baseUrl = new URL(c.req.url).origin
      const amountCents = Math.round(invoice.total * 100)
      const resp = await fetch('https://connect.squareup.com/v2/online-checkout/payment-links', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${squareToken}`,
          'Square-Version': '2025-01-23',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          idempotency_key: `svc-${id}-${Date.now()}`,
          quick_pay: {
            name: `Service Invoice ${invoice.invoice_number}`,
            price_money: { amount: amountCents, currency: 'CAD' },
            location_id: locationId || undefined
          },
          checkout_options: {
            redirect_url: `${baseUrl}/service-invoice/${id}?status=success`
          },
          pre_populated_data: { buyer_email: invoice.customer_email }
        })
      })
      const data: any = await resp.json()
      paymentLink = data.payment_link?.url || data.payment_link?.long_url || ''
    } catch {}
  }

  await c.env.DB.prepare(
    "UPDATE service_invoices SET status = 'sent', sent_at = datetime('now'), payment_link = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(paymentLink, id).run()

  return c.json({ success: true, payment_link: paymentLink, invoice_number: invoice.invoice_number })
})

// ============================================================
// CALL CENTER MANAGEMENT — Track calls, manage sales scripts
// ============================================================
adminRoutes.get('/superadmin/call-center/stats', async (c) => {
  try {
    const today = await c.env.DB.prepare(`
      SELECT COUNT(*) as total_calls,
        SUM(CASE WHEN call_status='connected' OR call_status='completed' THEN 1 ELSE 0 END) as connected,
        SUM(call_duration_seconds) as total_duration,
        SUM(CASE WHEN call_outcome='interested' OR call_outcome='demo_scheduled' THEN 1 ELSE 0 END) as hot_leads,
        SUM(CASE WHEN call_outcome='converted' THEN 1 ELSE 0 END) as converted
      FROM cc_call_logs WHERE date(started_at) = date('now')
    `).first<any>()

    const week = await c.env.DB.prepare(`
      SELECT COUNT(*) as total_calls,
        SUM(CASE WHEN call_status='connected' OR call_status='completed' THEN 1 ELSE 0 END) as connected,
        SUM(CASE WHEN call_outcome='demo_scheduled' THEN 1 ELSE 0 END) as demos,
        SUM(CASE WHEN call_outcome='converted' THEN 1 ELSE 0 END) as converted
      FROM cc_call_logs WHERE started_at >= date('now', '-7 days')
    `).first<any>()

    const recentCalls = await c.env.DB.prepare(`
      SELECT cl.*, p.company_name, p.contact_name
      FROM cc_call_logs cl
      LEFT JOIN cc_prospects p ON p.id = cl.prospect_id
      ORDER BY cl.started_at DESC LIMIT 50
    `).all<any>()

    const agents = await c.env.DB.prepare(`
      SELECT agent_name, COUNT(*) as total_calls,
        SUM(CASE WHEN call_status='connected' OR call_status='completed' THEN 1 ELSE 0 END) as connects,
        SUM(CASE WHEN call_outcome='demo_scheduled' THEN 1 ELSE 0 END) as demos,
        AVG(call_duration_seconds) as avg_duration
      FROM cc_call_logs WHERE started_at >= date('now', '-7 days')
      GROUP BY agent_name ORDER BY total_calls DESC
    `).all<any>()

    return c.json({
      today: today || {},
      week: week || {},
      recent_calls: recentCalls.results || [],
      agent_performance: agents.results || []
    })
  } catch {
    return c.json({ today: {}, week: {}, recent_calls: [], agent_performance: [] })
  }
})

adminRoutes.get('/superadmin/sales-scripts', async (c) => {
  try {
    const { results } = await c.env.DB.prepare(
      'SELECT * FROM sales_scripts ORDER BY category, created_at DESC'
    ).all<any>()
    return c.json({ scripts: results || [] })
  } catch {
    return c.json({ scripts: [] })
  }
})

adminRoutes.post('/superadmin/sales-scripts', async (c) => {
  const { name, category, script_body, notes } = await c.req.json()
  if (!name || !script_body) return c.json({ error: 'Name and script body required' }, 400)

  const result = await c.env.DB.prepare(
    'INSERT INTO sales_scripts (name, category, script_body, notes) VALUES (?, ?, ?, ?)'
  ).bind(name, category || 'cold_call', script_body, notes || '').run()

  return c.json({ success: true, id: result.meta.last_row_id })
})

adminRoutes.put('/superadmin/sales-scripts/:id', async (c) => {
  const id = c.req.param('id')
  const { name, category, script_body, notes, is_active } = await c.req.json()

  await c.env.DB.prepare(
    "UPDATE sales_scripts SET name = ?, category = ?, script_body = ?, notes = ?, is_active = ?, updated_at = datetime('now') WHERE id = ?"
  ).bind(name || '', category || 'cold_call', script_body || '', notes || '', is_active !== undefined ? (is_active ? 1 : 0) : 1, id).run()

  return c.json({ success: true })
})

adminRoutes.delete('/superadmin/sales-scripts/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM sales_scripts WHERE id = ?').bind(c.req.param('id')).run()
  return c.json({ success: true })
})
