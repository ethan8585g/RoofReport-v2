import { Hono } from 'hono'
import type { Bindings } from '../types'

export const companiesRoutes = new Hono<{ Bindings: Bindings }>()

// ============================================================
// MASTER COMPANIES
// ============================================================

// GET master company info
companiesRoutes.get('/master', async (c) => {
  try {
    const company = await c.env.DB.prepare('SELECT * FROM master_companies WHERE id = 1').first()
    if (!company) {
      return c.json({ company: null, message: 'No master company configured yet' })
    }
    return c.json({ company })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch master company', details: err.message }, 500)
  }
})

// CREATE / UPDATE master company
companiesRoutes.put('/master', async (c) => {
  try {
    const body = await c.req.json()
    const { company_name, contact_name, email, phone, address, city, province, postal_code, logo_url } = body

    if (!company_name || !contact_name || !email) {
      return c.json({ error: 'company_name, contact_name, and email are required' }, 400)
    }

    // Check if master company exists
    const existing = await c.env.DB.prepare('SELECT id FROM master_companies WHERE id = 1').first()

    if (existing) {
      await c.env.DB.prepare(`
        UPDATE master_companies SET
          company_name = ?, contact_name = ?, email = ?, phone = ?,
          address = ?, city = ?, province = ?, postal_code = ?, logo_url = ?,
          updated_at = datetime('now')
        WHERE id = 1
      `).bind(company_name, contact_name, email, phone || null, address || null, city || null, province || null, postal_code || null, logo_url || null).run()
    } else {
      await c.env.DB.prepare(`
        INSERT INTO master_companies (id, company_name, contact_name, email, phone, address, city, province, postal_code, logo_url, api_key)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(company_name, contact_name, email, phone || null, address || null, city || null, province || null, postal_code || null, logo_url || null, 'rc_' + Date.now()).run()
    }

    return c.json({ success: true, message: 'Master company saved' })
  } catch (err: any) {
    return c.json({ error: 'Failed to save master company', details: err.message }, 500)
  }
})

// ============================================================
// CUSTOMER COMPANIES
// ============================================================

// GET all customer companies
companiesRoutes.get('/customers', async (c) => {
  try {
    const companies = await c.env.DB.prepare(
      'SELECT * FROM customer_companies WHERE is_active = 1 ORDER BY company_name'
    ).all()
    return c.json({ companies: companies.results })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch customer companies', details: err.message }, 500)
  }
})

// GET single customer company
companiesRoutes.get('/customers/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const company = await c.env.DB.prepare(
      'SELECT * FROM customer_companies WHERE id = ?'
    ).bind(id).first()
    if (!company) return c.json({ error: 'Company not found' }, 404)
    return c.json({ company })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch company', details: err.message }, 500)
  }
})

// CREATE customer company
companiesRoutes.post('/customers', async (c) => {
  try {
    const body = await c.req.json()
    const { company_name, contact_name, email, phone, address, city, province, postal_code } = body

    if (!company_name || !contact_name || !email) {
      return c.json({ error: 'company_name, contact_name, and email are required' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO customer_companies (master_company_id, company_name, contact_name, email, phone, address, city, province, postal_code)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(company_name, contact_name, email, phone || null, address || null, city || null, province || null, postal_code || null).run()

    return c.json({
      success: true,
      company: { id: result.meta.last_row_id, company_name, contact_name, email }
    }, 201)
  } catch (err: any) {
    return c.json({ error: 'Failed to create customer company', details: err.message }, 500)
  }
})

// UPDATE customer company
companiesRoutes.put('/customers/:id', async (c) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { company_name, contact_name, email, phone, address, city, province, postal_code } = body

    await c.env.DB.prepare(`
      UPDATE customer_companies SET
        company_name = ?, contact_name = ?, email = ?, phone = ?,
        address = ?, city = ?, province = ?, postal_code = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(company_name, contact_name, email, phone || null, address || null, city || null, province || null, postal_code || null, id).run()

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: 'Failed to update company', details: err.message }, 500)
  }
})

// DELETE (soft) customer company
companiesRoutes.delete('/customers/:id', async (c) => {
  try {
    const id = c.req.param('id')
    await c.env.DB.prepare('UPDATE customer_companies SET is_active = 0, updated_at = datetime("now") WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: 'Failed to delete company', details: err.message }, 500)
  }
})
