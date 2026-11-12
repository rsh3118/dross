import crypto from 'node:crypto'
import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
const STATE_TTL_MS = 10 * 60 * 1000

function secretKey() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not configured')
  return crypto.createHash('sha256').update(secret).digest()
}

export function getGmailRedirectUri() {
  const base =
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.V0_RUNTIME_URL ?? 'http://localhost:3000')
  return `${base.replace(/\/$/, '')}/api/gmail/callback`
}

export function gmailClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getGmailRedirectUri(),
  )
}

export function gmailScopes() {
  return SCOPES
}

export function makeState(userId: string) {
  const payload = Buffer.from(
    JSON.stringify({ userId, expiresAt: Date.now() + STATE_TTL_MS, nonce: crypto.randomBytes(16).toString('hex') }),
  ).toString('base64url')
  const signature = crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function readState(state: string) {
  const [payload, signature] = state.split('.')
  if (!payload || !signature) throw new Error('Invalid OAuth state')
  const expected = crypto.createHmac('sha256', secretKey()).update(payload).digest('base64url')
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new Error('Invalid OAuth state')
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { userId: string; expiresAt: number }
  if (!parsed.userId || parsed.expiresAt < Date.now()) throw new Error('Expired OAuth state')
  return parsed
}

export function encryptToken(value: string) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.')
}

export function decryptToken(value: string) {
  const [ivText, tagText, encryptedText] = value.split('.')
  if (!ivText || !tagText || !encryptedText) throw new Error('Invalid encrypted token')
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(), Buffer.from(ivText, 'base64url'))
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([decipher.update(Buffer.from(encryptedText, 'base64url')), decipher.final()]).toString('utf8')
}

export { SCOPES }
