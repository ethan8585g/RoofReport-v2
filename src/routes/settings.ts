import { Hono } from 'hono'
import type { Bindings } from '../types'
import { validateAdminSession } from './auth'

export const settingsRoutes = new Hono<{ Bindings: Bindings }>()

// Admin auth middleware
settingsRoutes.use('/*', async (c, next) => {
  const admin = await validateAdminSession(c.env.DB, c.req.header('Authorization'))
  if (!admin) return c.json({ error: 'Admin authentication required' }, 401)
  c.set('admin' as any, admin)
  return next()
})

// ============================================================
// PRICING CONFIG — Get all pricing settings + packages in one call
// MUST be registered BEFORE /:key to avoid route conflict
// ============================================================
settingsRoutes.get('/pricing/config', async (c) => {
  try {
    const pricingKeys = [
      'price_per_report_cents',
      'secretary_monthly_price_cents',
      'secretary_per_call_price_cents',
      'subscription_monthly_price_cents',
      'subscription_annual_price_cents',
      'free_trial_reports',
      'subscription_features',
    ]
    const placeholders = pricingKeys.map(() => '?').join(',')
    const settings = await c.env.DB.prepare(
      `SELECT setting_key, setting_value FROM settings WHERE master_company_id = 1 AND setting_key IN (${placeholders})`
    ).bind(...pricingKeys).all()

    const settingsMap: Record<string, string> = {}
    for (const s of settings.results as any[]) {
      settingsMap[s.setting_key] = s.setting_value
    }

    // Get all credit packages (active and inactive for admin)
    const packages = await c.env.DB.prepare(
      'SELECT * FROM credit_packages ORDER BY sort_order ASC, credits ASC'
    ).all()

    // Get Square config status
    const hasSquareToken = !!(c.env as any).SQUARE_ACCESS_TOKEN
    const hasSquareLocation = !!(c.env as any).SQUARE_LOCATION_ID

    return c.json({
      pricing: {
        price_per_report_cents: parseInt(settingsMap.price_per_report_cents || '1000'),
        secretary_monthly_price_cents: parseInt(settingsMap.secretary_monthly_price_cents || '0'),
        secretary_per_call_price_cents: parseInt(settingsMap.secretary_per_call_price_cents || '0'),
        subscription_monthly_price_cents: parseInt(settingsMap.subscription_monthly_price_cents || '4900'),
        subscription_annual_price_cents: parseInt(settingsMap.subscription_annual_price_cents || '47900'),
        free_trial_reports: parseInt(settingsMap.free_trial_reports || '3'),
        subscription_features: settingsMap.subscription_features || '',
      },
      packages: packages.results,
      square: {
        access_token_configured: hasSquareToken,
        location_id_configured: hasSquareLocation,
      }
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch pricing config', details: err.message }, 500)
  }
})

// UPDATE PRICING SETTINGS
settingsRoutes.put('/pricing/config', async (c) => {
  try {
    const body = await c.req.json()
    const allowedKeys = [
      'price_per_report_cents',
      'secretary_monthly_price_cents',
      'secretary_per_call_price_cents',
      'subscription_monthly_price_cents',
      'subscription_annual_price_cents',
      'free_trial_reports',
      'subscription_features',
    ]

    let updated = 0
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        const value = String(body[key])
        const existing = await c.env.DB.prepare(
          'SELECT id FROM settings WHERE master_company_id = 1 AND setting_key = ?'
        ).bind(key).first()

        if (existing) {
          await c.env.DB.prepare(
            `UPDATE settings SET setting_value = ?, updated_at = datetime('now') WHERE master_company_id = 1 AND setting_key = ?`
          ).bind(value, key).run()
        } else {
          await c.env.DB.prepare(
            `INSERT INTO settings (master_company_id, setting_key, setting_value, is_encrypted) VALUES (1, ?, ?, 0)`
          ).bind(key, value).run()
        }
        updated++
      }
    }

    if (body.free_trial_reports !== undefined) {
      console.log(`[Settings] Free trial reports updated to ${body.free_trial_reports}`)
    }

    await c.env.DB.prepare(
      `INSERT INTO user_activity_log (company_id, action, details) VALUES (1, 'pricing_updated', ?)`
    ).bind(`Pricing settings updated (${updated} fields)`).run()

    return c.json({ success: true, updated })
  } catch (err: any) {
    return c.json({ error: 'Failed to update pricing', details: err.message }, 500)
  }
})

// ============================================================
// CREDIT PACKAGES — Full CRUD
// MUST be registered BEFORE /:key
// ============================================================
settingsRoutes.get('/packages', async (c) => {
  try {
    const packages = await c.env.DB.prepare(
      'SELECT * FROM credit_packages ORDER BY sort_order ASC, credits ASC'
    ).all()
    return c.json({ packages: packages.results })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch packages', details: err.message }, 500)
  }
})

settingsRoutes.post('/packages', async (c) => {
  try {
    const { name, description, credits, price_cents, sort_order, is_active } = await c.req.json()
    if (!name || !credits || !price_cents) {
      return c.json({ error: 'name, credits, and price_cents are required' }, 400)
    }

    const result = await c.env.DB.prepare(`
      INSERT INTO credit_packages (name, description, credits, price_cents, sort_order, is_active)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(
      name, description || '', credits, price_cents,
      sort_order ?? 0, is_active !== undefined ? (is_active ? 1 : 0) : 1
    ).run()

    await c.env.DB.prepare(
      `INSERT INTO user_activity_log (company_id, action, details) VALUES (1, 'package_created', ?)`
    ).bind(`Created package "${name}" — ${credits} credits @ $${(price_cents / 100).toFixed(2)}`).run()

    return c.json({ success: true, id: result.meta.last_row_id })
  } catch (err: any) {
    return c.json({ error: 'Failed to create package', details: err.message }, 500)
  }
})

settingsRoutes.put('/packages/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    const { name, description, credits, price_cents, sort_order, is_active } = await c.req.json()

    const existing = await c.env.DB.prepare('SELECT * FROM credit_packages WHERE id = ?').bind(id).first()
    if (!existing) return c.json({ error: 'Package not found' }, 404)

    await c.env.DB.prepare(`
      UPDATE credit_packages SET
        name = COALESCE(?, name),
        description = COALESCE(?, description),
        credits = COALESCE(?, credits),
        price_cents = COALESCE(?, price_cents),
        sort_order = COALESCE(?, sort_order),
        is_active = COALESCE(?, is_active)
      WHERE id = ?
    `).bind(
      name ?? null, description ?? null, credits ?? null, price_cents ?? null,
      sort_order ?? null, is_active !== undefined ? (is_active ? 1 : 0) : null,
      id
    ).run()

    await c.env.DB.prepare(
      `INSERT INTO user_activity_log (company_id, action, details) VALUES (1, 'package_updated', ?)`
    ).bind(`Updated package #${id} "${name || (existing as any).name}"`).run()

    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: 'Failed to update package', details: err.message }, 500)
  }
})

settingsRoutes.delete('/packages/:id', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    await c.env.DB.prepare('UPDATE credit_packages SET is_active = 0 WHERE id = ?').bind(id).run()
    await c.env.DB.prepare(
      `INSERT INTO user_activity_log (company_id, action, details) VALUES (1, 'package_deactivated', ?)`
    ).bind(`Deactivated package #${id}`).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: 'Failed to delete package', details: err.message }, 500)
  }
})

settingsRoutes.put('/packages/:id/activate', async (c) => {
  try {
    const id = parseInt(c.req.param('id'))
    await c.env.DB.prepare('UPDATE credit_packages SET is_active = 1 WHERE id = ?').bind(id).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: 'Failed to activate package', details: err.message }, 500)
  }
})

// ============================================================
// SQUARE STATUS — Verify Square integration
// ============================================================
settingsRoutes.get('/square/status', async (c) => {
  try {
    const accessToken = (c.env as any).SQUARE_ACCESS_TOKEN
    const locationId = (c.env as any).SQUARE_LOCATION_ID

    if (!accessToken) {
      return c.json({
        connected: false,
        error: 'SQUARE_ACCESS_TOKEN not configured',
        instructions: 'Set SQUARE_ACCESS_TOKEN as a Cloudflare Pages secret'
      })
    }

    let merchantInfo: any = null
    let locationInfo: any = null
    let error: string | null = null

    try {
      const merchantRes = await fetch('https://connect.squareup.com/v2/merchants/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Square-Version': '2025-01-23',
        }
      })
      if (merchantRes.ok) {
        const data: any = await merchantRes.json()
        merchantInfo = {
          id: data.merchant?.[0]?.id,
          business_name: data.merchant?.[0]?.business_name,
          country: data.merchant?.[0]?.country,
          currency: data.merchant?.[0]?.currency,
        }
      } else {
        error = `Merchant API returned ${merchantRes.status}`
      }
    } catch (e: any) {
      error = e.message
    }

    if (locationId) {
      try {
        const locRes = await fetch(`https://connect.squareup.com/v2/locations/${locationId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Square-Version': '2025-01-23',
          }
        })
        if (locRes.ok) {
          const data: any = await locRes.json()
          locationInfo = {
            id: data.location?.id,
            name: data.location?.name,
            status: data.location?.status,
            currency: data.location?.currency,
          }
        }
      } catch {}
    }

    const paymentCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM square_payments').first<any>()
    const webhookCount = await c.env.DB.prepare('SELECT COUNT(*) as cnt FROM square_webhook_events').first<any>()

    return c.json({
      connected: !error,
      merchant: merchantInfo,
      location: locationInfo,
      location_id_configured: !!locationId,
      error,
      stats: {
        total_payments: paymentCount?.cnt || 0,
        total_webhooks: webhookCount?.cnt || 0,
      }
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to check Square status', details: err.message }, 500)
  }
})

// ============================================================
// BULK UPDATE SETTINGS
// MUST be registered BEFORE /:key
// ============================================================
settingsRoutes.post('/bulk', async (c) => {
  try {
    const { settings } = await c.req.json()
    if (!Array.isArray(settings)) {
      return c.json({ error: 'settings must be an array of {key, value, encrypted?}' }, 400)
    }

    for (const s of settings) {
      const isEncrypted = s.encrypted ? 1 : 0
      const existing = await c.env.DB.prepare(
        'SELECT id FROM settings WHERE master_company_id = 1 AND setting_key = ?'
      ).bind(s.key).first()

      if (existing) {
        await c.env.DB.prepare(`
          UPDATE settings SET setting_value = ?, is_encrypted = ?, updated_at = datetime('now')
          WHERE master_company_id = 1 AND setting_key = ?
        `).bind(s.value, isEncrypted, s.key).run()
      } else {
        await c.env.DB.prepare(`
          INSERT INTO settings (master_company_id, setting_key, setting_value, is_encrypted)
          VALUES (1, ?, ?, ?)
        `).bind(s.key, s.value, isEncrypted).run()
      }
    }

    return c.json({ success: true, count: settings.length })
  } catch (err: any) {
    return c.json({ error: 'Failed to bulk update settings', details: err.message }, 500)
  }
})

// ============================================================
// GENERIC SETTINGS CRUD — These /:key routes MUST be LAST
// ============================================================

// GET all settings for master company
settingsRoutes.get('/', async (c) => {
  try {
    const settings = await c.env.DB.prepare(
      'SELECT setting_key, setting_value, is_encrypted, updated_at FROM settings WHERE master_company_id = 1'
    ).all()

    const masked = settings.results.map((s: any) => ({
      ...s,
      setting_value: s.is_encrypted ? maskValue(s.setting_value) : s.setting_value
    }))

    return c.json({ settings: masked })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch settings', details: err.message }, 500)
  }
})

// GET single setting
settingsRoutes.get('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const setting = await c.env.DB.prepare(
      'SELECT setting_key, setting_value, is_encrypted, updated_at FROM settings WHERE master_company_id = 1 AND setting_key = ?'
    ).bind(key).first<any>()

    if (!setting) return c.json({ error: 'Setting not found' }, 404)

    return c.json({
      setting: {
        ...setting,
        setting_value: setting.is_encrypted ? maskValue(setting.setting_value) : setting.setting_value,
        has_value: !!setting.setting_value
      }
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch setting', details: err.message }, 500)
  }
})

// SET / UPDATE a setting
settingsRoutes.put('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const { value, encrypted } = await c.req.json()

    if (value === undefined) {
      return c.json({ error: 'value is required' }, 400)
    }

    const isEncrypted = encrypted ? 1 : 0

    const existing = await c.env.DB.prepare(
      'SELECT id FROM settings WHERE master_company_id = 1 AND setting_key = ?'
    ).bind(key).first()

    if (existing) {
      await c.env.DB.prepare(`
        UPDATE settings SET setting_value = ?, is_encrypted = ?, updated_at = datetime('now')
        WHERE master_company_id = 1 AND setting_key = ?
      `).bind(value, isEncrypted, key).run()
    } else {
      await c.env.DB.prepare(`
        INSERT INTO settings (master_company_id, setting_key, setting_value, is_encrypted)
        VALUES (1, ?, ?, ?)
      `).bind(key, value, isEncrypted).run()
    }

    await c.env.DB.prepare(`
      INSERT INTO user_activity_log (company_id, action, details)
      VALUES (1, 'setting_updated', ?)
    `).bind(`Setting "${key}" updated`).run()

    return c.json({ success: true, key, message: `Setting "${key}" saved successfully` })
  } catch (err: any) {
    return c.json({ error: 'Failed to save setting', details: err.message }, 500)
  }
})

// DELETE a setting
settingsRoutes.delete('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    await c.env.DB.prepare(
      'DELETE FROM settings WHERE master_company_id = 1 AND setting_key = ?'
    ).bind(key).run()
    return c.json({ success: true })
  } catch (err: any) {
    return c.json({ error: 'Failed to delete setting', details: err.message }, 500)
  }
})

function maskValue(val: string): string {
  if (!val || val.length < 8) return '****'
  return val.slice(0, 4) + '****' + val.slice(-4)
}
