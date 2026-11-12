import { auth } from '@/lib/auth'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { gmailClient, gmailScopes, makeState } from '@/lib/gmail-oauth'

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.redirect(new URL('/sign-in', new URL(request.url).origin))

  const url = gmailClient().generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: gmailScopes(),
    state: makeState(session.user.id),
  })
  return NextResponse.redirect(url)
}
