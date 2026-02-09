// ============================================================
// GCP Service Account Authentication for Cloudflare Workers
// ============================================================
// Generates OAuth2 access tokens from a GCP service account JSON key
// using Web Crypto API (Cloudflare Workers compatible — no Node.js).
//
// Flow:
// 1. Parse service account JSON from env var
// 2. Create JWT assertion (RS256 signed with private key)
// 3. Exchange JWT for OAuth2 access token at Google's token endpoint
// 4. Cache token until near-expiry (50 min of 60 min lifetime)
// ============================================================

interface ServiceAccountKey {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
  auth_provider_x509_cert_url: string
  client_x509_cert_url: string
}

interface TokenCache {
  accessToken: string
  expiresAt: number  // Unix timestamp (ms)
}

// In-memory token cache (per-isolate — good enough for Workers)
let tokenCache: TokenCache | null = null

// ============================================================
// Base64URL encoding helpers (Web Crypto compatible)
// ============================================================
function base64urlEncode(data: string): string {
  return btoa(data)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function arrayBufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ============================================================
// Import PEM private key into CryptoKey (Web Crypto API)
// ============================================================
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Strip PEM headers and decode base64
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s/g, '')

  const binaryString = atob(pemContents)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }

  return crypto.subtle.importKey(
    'pkcs8',
    bytes.buffer,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256'
    },
    false,
    ['sign']
  )
}

// ============================================================
// Create signed JWT assertion
// ============================================================
async function createJWT(sa: ServiceAccountKey, scopes: string[]): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const header = {
    alg: 'RS256',
    typ: 'JWT'
  }

  const payload = {
    iss: sa.client_email,
    sub: sa.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: scopes.join(' ')
  }

  const encodedHeader = base64urlEncode(JSON.stringify(header))
  const encodedPayload = base64urlEncode(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`

  const key = await importPrivateKey(sa.private_key)
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  )

  const encodedSignature = arrayBufferToBase64url(signature)
  return `${signingInput}.${encodedSignature}`
}

// ============================================================
// Exchange JWT for OAuth2 access token
// ============================================================
async function exchangeJWTForToken(jwt: string): Promise<{ access_token: string; expires_in: number }> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`OAuth2 token exchange failed (${response.status}): ${err}`)
  }

  return response.json()
}

// ============================================================
// PUBLIC API: Get a valid access token (auto-refresh)
// ============================================================
export async function getAccessToken(serviceAccountJson: string): Promise<string> {
  // Check cache (50 min buffer on 60 min lifetime)
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.accessToken
  }

  // Parse service account JSON
  let sa: ServiceAccountKey
  try {
    sa = JSON.parse(serviceAccountJson)
  } catch (e) {
    throw new Error('Invalid GCP_SERVICE_ACCOUNT_KEY JSON: ' + (e as Error).message)
  }

  if (sa.type !== 'service_account') {
    throw new Error(`Expected service_account type, got "${sa.type}"`)
  }

  console.log(`[GCP Auth] Generating access token for ${sa.client_email} (project: ${sa.project_id})`)

  // Create JWT with required scopes
  const scopes = [
    'https://www.googleapis.com/auth/cloud-platform',
    'https://www.googleapis.com/auth/generative-language',
    'https://www.googleapis.com/auth/generative-language.retriever'
  ]

  const jwt = await createJWT(sa, scopes)
  const tokenResponse = await exchangeJWTForToken(jwt)

  // Cache the token (refresh 10 min before expiry)
  tokenCache = {
    accessToken: tokenResponse.access_token,
    expiresAt: Date.now() + (tokenResponse.expires_in - 600) * 1000
  }

  console.log(`[GCP Auth] Token generated, expires in ${tokenResponse.expires_in}s`)
  return tokenResponse.access_token
}

// ============================================================
// PUBLIC API: Get project ID from service account key
// ============================================================
export function getProjectId(serviceAccountJson: string): string | null {
  try {
    const sa = JSON.parse(serviceAccountJson)
    return sa.project_id || null
  } catch {
    return null
  }
}

// ============================================================
// PUBLIC API: Get service account email
// ============================================================
export function getServiceAccountEmail(serviceAccountJson: string): string | null {
  try {
    const sa = JSON.parse(serviceAccountJson)
    return sa.client_email || null
  } catch {
    return null
  }
}
