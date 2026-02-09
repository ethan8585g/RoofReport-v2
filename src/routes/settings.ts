import { Hono } from 'hono'
import type { Bindings } from '../types'

export const settingsRoutes = new Hono<{ Bindings: Bindings }>()

// GET all settings for master company
settingsRoutes.get('/', async (c) => {
  try {
    const settings = await c.env.DB.prepare(
      'SELECT setting_key, setting_value, is_encrypted, updated_at FROM settings WHERE master_company_id = 1'
    ).all()

    // Mask encrypted values
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

    // Upsert
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

    // Log the activity
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

// Bulk update settings
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

function maskValue(val: string): string {
  if (!val || val.length < 8) return '****'
  return val.slice(0, 4) + '****' + val.slice(-4)
}
