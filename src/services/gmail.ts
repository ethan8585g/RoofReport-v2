
import type { Bindings } from '../types'

// ============================================================
// GMAIL API SERVICE
// ============================================================
// Centralized logic for Gmail API interactions using OAuth2
// user-consent flow (refresh tokens).

export interface GmailThread {
    id: string
    snippet: string
    historyId: string
    messages: GmailMessage[]
}

export interface GmailMessage {
    id: string
    threadId: string
    labelIds: string[]
    snippet: string
    payload: {
        mimeType: string
        headers: { name: string; value: string }[]
        body: { size: number; data?: string }
        parts?: any[]
    }
}

export interface GmailProfile {
    emailAddress: string
    messagesTotal: number
    threadsTotal: number
    historyId: string
}

export interface GmailLabel {
    id: string
    name: string
    type: 'system' | 'user'
}

export class GmailService {
    private clientId: string
    private clientSecret: string
    private refreshToken: string
    private accessToken: string | null = null
    private tokenExpiresAt: number = 0

    constructor(clientId: string, clientSecret: string, refreshToken: string) {
        this.clientId = clientId
        this.clientSecret = clientSecret
        this.refreshToken = refreshToken
    }

    /**
     * Get valid access token, refreshing if necessary
     */
    private async getAccessToken(): Promise<string> {
        if (this.accessToken && Date.now() < this.tokenExpiresAt - 60000) { // 1 min buffer
            return this.accessToken
        }

        // Refresh token
        const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: this.refreshToken
            }).toString()
        })

        if (!tokenResp.ok) {
            const err = await tokenResp.text()
            throw new Error(`Gmail OAuth2 token refresh failed (${tokenResp.status}): ${err}`)
        }

        const tokenData: any = await tokenResp.json()
        this.accessToken = tokenData.access_token
        this.tokenExpiresAt = Date.now() + (tokenData.expires_in * 1000)
        return this.accessToken
    }

    /**
     * Generic fetch wrapper for Gmail API
     */
    private async fetch(endpoint: string, options: RequestInit = {}): Promise<any> {
        const token = await this.getAccessToken()

        // Ensure endpoint starts with /
        const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
        const url = `https://gmail.googleapis.com/gmail/v1/users/me${path}`

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...((options.headers || {}) as any)
        }

        const response = await fetch(url, { ...options, headers })

        if (!response.ok) {
            const errorText = await response.text()
            throw new Error(`Gmail API Error ${response.status} (${url}): ${errorText}`)
        }

        if (response.status === 204) return null
        return response.json()
    }

    // ---- READ OPERATIONS ----

    async getProfile(): Promise<GmailProfile> {
        return this.fetch('/profile')
    }

    /**
     * List threads matching query
     * @param query Gmail search query (e.g. "from:someone@example.com is:unread")
     */
    async listThreads(query: string = '', maxResults: number = 10, pageToken?: string): Promise<{ threads: GmailThread[], nextPageToken?: string, resultSizeEstimate: number }> {
        const params = new URLSearchParams()
        if (query) params.append('q', query)
        if (maxResults) params.append('maxResults', maxResults.toString())
        if (pageToken) params.append('pageToken', pageToken)

        return this.fetch(`/threads?${params.toString()}`)
    }

    async getThread(threadId: string): Promise<GmailThread> {
        return this.fetch(`/threads/${threadId}`)
    }

    async listMessages(query: string = '', maxResults: number = 10, pageToken?: string): Promise<{ messages: GmailMessage[], nextPageToken?: string, resultSizeEstimate: number }> {
        const params = new URLSearchParams()
        if (query) params.append('q', query)
        if (maxResults) params.append('maxResults', maxResults.toString())
        if (pageToken) params.append('pageToken', pageToken)

        return this.fetch(`/messages?${params.toString()}`)
    }

    async getMessage(messageId: string): Promise<GmailMessage> {
        return this.fetch(`/messages/${messageId}`)
    }

    async getAttachment(messageId: string, attachmentId: string): Promise<{ size: number, data: string }> {
        return this.fetch(`/messages/${messageId}/attachments/${attachmentId}`)
    }

    async listLabels(): Promise<{ labels: GmailLabel[] }> {
        return this.fetch('/labels')
    }

    // ---- WRITE/MANAGE OPERATIONS ----

    async modifyMessage(messageId: string, addLabelIds: string[] = [], removeLabelIds: string[] = []): Promise<GmailMessage> {
        return this.fetch(`/messages/${messageId}/modify`, {
            method: 'POST',
            body: JSON.stringify({ addLabelIds, removeLabelIds })
        })
    }

    async watch(topicName: string, labelIds: string[] = ['INBOX']): Promise<{ historyId: string, expiration: string }> {
        return this.fetch('/watch', {
            method: 'POST',
            body: JSON.stringify({ topicName, labelIds })
        })
    }

    async stopWatch(): Promise<void> {
        return this.fetch('/stop', { method: 'POST' })
    }

    // ---- SENDING OPERATIONS ----

    /**
     * Send an email (HTML supported)
     * @param to Recipient email
     * @param subject Email subject
     * @param htmlBody HTML content
     * @param fromEmail Optional 'From' header (must range authorized user or alias)
     */
    async sendEmail(to: string, subject: string, htmlBody: string, fromEmail?: string): Promise<GmailMessage> {
        const boundary = 'boundary_' + Date.now()

        // Encode HTML body to base64 (standard btoa)
        // We use TextEncoder to handle Unicode characters correctly before btoa
        const htmlBodyFull = new TextEncoder().encode(htmlBody)
        const htmlBase64 = this.arrayBufferToBase64(htmlBodyFull)

        const fromHeader = fromEmail ? `From: ${fromEmail}` : '' // API infers 'me' if omitted, but good to be explicit if provided

        const rawMessageParts = [
            fromHeader,
            `To: ${to}`,
            `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`,
            `MIME-Version: 1.0`,
            `Content-Type: multipart/alternative; boundary="${boundary}"`,
            '',
            `--${boundary}`,
            'Content-Type: text/plain; charset=UTF-8',
            'Content-Transfer-Encoding: 7bit',
            '',
            'This email requires an HTML-capable client.',
            '',
            `--${boundary}`,
            'Content-Type: text/html; charset=UTF-8',
            'Content-Transfer-Encoding: base64',
            '',
            htmlBase64,
            '',
            `--${boundary}--`
        ]

        // Filter out empty lines if fromHeader was empty
        const rawMessage = rawMessageParts.filter(line => line !== '').join('\r\n')

        // Encode entire message to web-safe base64 string
        const messageBytes = new TextEncoder().encode(rawMessage)
        const encodedMessage = this.arrayBufferToBase64Url(messageBytes)

        return this.fetch('/messages/send', {
            method: 'POST',
            body: JSON.stringify({ raw: encodedMessage })
        })
    }

    // Helper: ArrayBuffer to Base64 (Standard)
    private arrayBufferToBase64(buffer: Uint8Array): string {
        let binary = ''
        const len = buffer.byteLength
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(buffer[i])
        }
        return btoa(binary)
    }

    // Helper: ArrayBuffer to Base64URL (Web Safe)
    private arrayBufferToBase64Url(buffer: Uint8Array): string {
        return this.arrayBufferToBase64(buffer)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '')
    }
}
