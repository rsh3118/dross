import { NextResponse } from 'next/server'

const base = () => process.env.BETTER_AUTH_URL ? process.env.BETTER_AUTH_URL.replace(/\/$/, '') : 'https://www.dross.quest'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'Authorization, Content-Type, Accept' } })
}

export async function GET() {
  const origin = base()
  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['mcp:read', 'mcp:write', 'mcp:schema'],
    bearer_methods_supported: ['header'],
  }, { headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } })
}
