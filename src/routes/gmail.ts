
import { Hono } from 'hono'
import { GmailService } from '../services/gmail'
import type { Bindings } from '../types'

export const gmailRoutes = new Hono<{ Bindings: Bindings }>()

// Helper to get initialized service
async function getGmailService(c: any): Promise<GmailService> {
    let refreshToken = c.env.GMAIL_REFRESH_TOKEN
    const clientId = c.env.GMAIL_CLIENT_ID
    const clientSecret = c.env.GMAIL_CLIENT_SECRET

    if (!clientId || !clientSecret) {
        throw new Error('Gmail API not configured (missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET)')
    }

    // Fallback to DB if not in env
    if (!refreshToken) {
        try {
            const row = await c.env.DB.prepare(
                "SELECT setting_value FROM settings WHERE setting_key = 'gmail_refresh_token' AND master_company_id = 1"
            ).first<any>()
            if (row?.setting_value) {
                refreshToken = row.setting_value
            }
        } catch (e) { /* ignore */ }
    }

    if (!refreshToken) {
        throw new Error('Gmail refresh token not found. Please authorize at /api/auth/gmail')
    }

    return new GmailService(clientId, clientSecret, refreshToken)
}

// ---- ROUTES ----

// Get Profile
gmailRoutes.get('/profile', async (c) => {
    try {
        const service = await getGmailService(c)
        const profile = await service.getProfile()
        return c.json(profile)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// List Threads
gmailRoutes.get('/threads', async (c) => {
    try {
        const service = await getGmailService(c)
        const query = c.req.query('q') || ''
        const maxResults = parseInt(c.req.query('maxResults') || '10')
        const pageToken = c.req.query('pageToken')

        const result = await service.listThreads(query, maxResults, pageToken)
        return c.json(result)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// Get Thread
gmailRoutes.get('/threads/:id', async (c) => {
    try {
        const service = await getGmailService(c)
        const thread = await service.getThread(c.req.param('id'))
        return c.json(thread)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// List Messages
gmailRoutes.get('/messages', async (c) => {
    try {
        const service = await getGmailService(c)
        const query = c.req.query('q') || ''
        const maxResults = parseInt(c.req.query('maxResults') || '10')
        const pageToken = c.req.query('pageToken')

        const result = await service.listMessages(query, maxResults, pageToken)
        return c.json(result)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// Get Message
gmailRoutes.get('/messages/:id', async (c) => {
    try {
        const service = await getGmailService(c)
        const message = await service.getMessage(c.req.param('id'))
        return c.json(message)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// Get Attachment
gmailRoutes.get('/messages/:messageId/attachments/:id', async (c) => {
    try {
        const service = await getGmailService(c)
        const attachment = await service.getAttachment(c.req.param('messageId'), c.req.param('id'))
        return c.json(attachment)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// Modify Message (Labels)
gmailRoutes.post('/messages/:id/modify', async (c) => {
    try {
        const service = await getGmailService(c)
        const { addLabelIds, removeLabelIds } = await c.req.json()
        const result = await service.modifyMessage(c.req.param('id'), addLabelIds, removeLabelIds)
        return c.json(result)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// List Labels
gmailRoutes.get('/labels', async (c) => {
    try {
        const service = await getGmailService(c)
        const result = await service.listLabels()
        return c.json(result)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// Watch (Push Notifications)
gmailRoutes.post('/watch', async (c) => {
    try {
        const service = await getGmailService(c)
        const { topicName, labelIds } = await c.req.json()
        if (!topicName) return c.json({ error: 'Missing topicName' }, 400)

        const result = await service.watch(topicName, labelIds)
        return c.json(result)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// Stop Watch
gmailRoutes.post('/stop', async (c) => {
    try {
        const service = await getGmailService(c)
        await service.stopWatch()
        return c.json({ success: true })
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})

// Send Email (Manual/Test)
gmailRoutes.post('/send', async (c) => {
    try {
        const service = await getGmailService(c)
        const { to, subject, htmlBody, fromEmail } = await c.req.json()

        if (!to || !subject || !htmlBody) {
            return c.json({ error: 'Missing to, subject, or htmlBody' }, 400)
        }

        const result = await service.sendEmail(to, subject, htmlBody, fromEmail)
        return c.json(result)
    } catch (err: any) {
        return c.json({ error: err.message }, 500)
    }
})
