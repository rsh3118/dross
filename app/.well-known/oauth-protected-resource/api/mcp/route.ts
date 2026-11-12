import { NextResponse } from 'next/server'

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS' } })
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin
  return NextResponse.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: ['mcp:read', 'mcp:write', 'mcp:schema'],
    bearer_methods_supported: ['header'],
  }, { headers: { 'cache-control': 'public, max-age=300' } })
}
