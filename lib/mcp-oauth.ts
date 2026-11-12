import crypto from 'node:crypto'

const secret = () => process.env.BETTER_AUTH_SECRET ?? ''
const encode = (value: object | string) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url')
const sign = (value: string) => crypto.createHmac('sha256', secret()).update(value).digest('base64url')

export function createOAuthToken(payload: Record<string, unknown>) {
  const body = encode(payload)
  return `${body}.${sign(body)}`
}

export function verifyOAuthToken(token: string) {
  const [body, signature] = token.split('.')
  if (!body || !signature || !secret()) return null
  const expected = sign(body)
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as Record<string, unknown>
  if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null
  return payload
}

export function verifyPkce(verifier: string, challenge: string) {
  return crypto.createHash('sha256').update(verifier).digest('base64url') === challenge
}
