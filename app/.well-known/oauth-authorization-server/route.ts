import { NextResponse } from 'next/server'

const base = () => process.env.BETTER_AUTH_URL ? process.env.BETTER_AUTH_URL.replace(/\/$/, '') : 'https://www.dross.quest'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' } })
}

export async function GET() {
  const origin = base()
  return NextResponse.json({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    client_id_metadata_document_supported: true,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp:read', 'mcp:write', 'mcp:schema'],
  })
}
