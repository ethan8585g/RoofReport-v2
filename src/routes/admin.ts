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

    // Customer count
    const customerCount = await c.env.DB.prepare(
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

    // Migration 0007: Customer credits & Stripe columns
    const customerCreditCols = [
      'report_credits INTEGER DEFAULT 0',
      'credits_used INTEGER DEFAULT 0',
      'stripe_customer_id TEXT',
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
    // Old production DB had CHECK(service_tier IN ('immediate','urgent','regular'))
    // New tiers are 'express' and 'standard'. SQLite requires table recreation to drop constraints.
    try {
      const checkRow = await c.env.DB.prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='orders'"
      ).first<any>()
      if (checkRow?.sql && checkRow.sql.includes("'immediate'")) {
        // Old constraint detected — recreate orders table without it
        await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS orders_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          order_number TEXT UNIQUE NOT NULL,
          master_company_id INTEGER NOT NULL,
          customer_company_id INTEGER,
          customer_id INTEGER,
          property_address TEXT NOT NULL, property_city TEXT, property_province TEXT, property_postal_code TEXT,
          latitude REAL, longitude REAL,
          homeowner_name TEXT NOT NULL, homeowner_phone TEXT, homeowner_email TEXT,
          requester_name TEXT NOT NULL, requester_company TEXT, requester_email TEXT, requester_phone TEXT,
          service_tier TEXT NOT NULL, price REAL NOT NULL,
          status TEXT DEFAULT 'pending', payment_status TEXT DEFAULT 'unpaid',
          payment_intent_id TEXT, estimated_delivery TEXT, delivered_at TEXT, notes TEXT,
          is_trial INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')),
          FOREIGN KEY (master_company_id) REFERENCES master_companies(id),
          FOREIGN KEY (customer_company_id) REFERENCES customer_companies(id),
          FOREIGN KEY (customer_id) REFERENCES customers(id)
        )`).run()
        await c.env.DB.prepare(`INSERT INTO orders_new SELECT
          id, order_number, master_company_id, customer_company_id, customer_id,
          property_address, property_city, property_province, property_postal_code,
          latitude, longitude,
          homeowner_name, homeowner_phone, homeowner_email,
          requester_name, requester_company, requester_email, requester_phone,
          service_tier, price, status, payment_status,
          payment_intent_id, estimated_delivery, delivered_at, notes, is_trial,
          created_at, updated_at
        FROM orders`).run()
        await c.env.DB.prepare('DROP TABLE orders').run()
        await c.env.DB.prepare('ALTER TABLE orders_new RENAME TO orders').run()
        // Recreate indexes
        await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)').run()
        await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)').run()
        await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number)').run()
        await c.env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id)').run()
      }
    } catch(e) {}

    // Stripe tables
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

    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS credit_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL, description TEXT,
        credits INTEGER NOT NULL, price_cents INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1, sort_order INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `).run()

    // Seed default credit packages — Pricing: Single=$10, 5=$7/ea, 10=$6/ea, 25=$5.50/ea, 50=$5/ea, 100=$4.75/ea
    await c.env.DB.prepare(`DELETE FROM credit_packages`).run()
    await c.env.DB.prepare(`
      INSERT INTO credit_packages (id, name, description, credits, price_cents, sort_order)
      VALUES
        (1, '5 Pack', '5 reports — $7.00/ea — Save 30%', 5, 3500, 1),
        (2, '10 Pack', '10 reports — $6.00/ea — Save 40%', 10, 6000, 2),
        (3, '25 Pack', '25 reports — $5.50/ea — Save 45%', 25, 13750, 3),
        (4, '50 Pack', '50 reports — $5.00/ea — Save 50%', 50, 25000, 4),
        (5, '100 Pack', '100 reports — best value — $4.75/ea — Save 52%', 100, 47500, 5)
    `).run()

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

    // Individual credit pack purchases (from stripe_payments)
    const salesByPeriod = await c.env.DB.prepare(`
      SELECT ${groupBy} as period,
        COUNT(*) as transactions,
        SUM(sp.amount) as total_cents,
        SUM(CASE WHEN sp.status = 'completed' THEN sp.amount ELSE 0 END) as paid_cents
      FROM stripe_payments sp
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
      FROM stripe_payments sp
      LEFT JOIN customers c ON sp.customer_id = c.id
      ORDER BY sp.created_at DESC
      LIMIT 50
    `).all()

    // Summary totals
    const totals = await c.env.DB.prepare(`
      SELECT
        COUNT(*) as total_transactions,
        SUM(amount) as total_cents,
        SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as paid_cents
      FROM stripe_payments
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
