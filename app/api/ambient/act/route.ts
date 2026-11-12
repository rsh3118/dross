import { type NextRequest, NextResponse } from 'next/server'
import { verifyAction } from '@/lib/ambient'
import { appBaseUrl, resolveCaptured } from '@/lib/ambient-process'

export const runtime = 'nodejs'

// Signed one-click links from the digest email. No session required — the HMAC
// binds the request to a specific user + action + scope.
function page(title: string, message: string) {
  const base = appBaseUrl()
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#15171d;color:#ece9e2;font-family:ui-sans-serif,system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;">
<div style="max-width:420px;padding:32px;text-align:center;">
  <p style="font-family:ui-monospace,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#d9924a;margin:0 0 12px;">dross</p>
  <h1 style="font-size:22px;margin:0 0 12px;">${title}</h1>
  <p style="color:#8a8f9c;font-size:15px;line-height:1.6;margin:0 0 24px;">${message}</p>
  <a href="${base}/capture" style="display:inline-block;padding:10px 20px;border-radius:8px;background:#d9924a;color:#15171d;text-decoration:none;font-weight:600;">Open Capture</a>
</div></body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  )
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const userId = sp.get('u') ?? ''
  const action = sp.get('a') === 'dismiss' ? 'dismiss' : 'approve'
  const scopeRaw = sp.get('s') ?? 'all'
  const sig = sp.get('sig') ?? ''

  if (!userId || !verifyAction(userId, action, scopeRaw, sig)) {
    return page('Link expired', 'This action link is not valid. Open Capture to review your queue.')
  }

  const scope = scopeRaw === 'all' ? 'all' : Number(scopeRaw)
  if (scope !== 'all' && !Number.isInteger(scope)) {
    return page('Invalid link', 'That link points to nothing. Open Capture to review your queue.')
  }

  const n = await resolveCaptured(userId, action, scope as number | 'all')
  if (action === 'approve') {
    return page(
      n > 0 ? `Added ${n} task${n === 1 ? '' : 's'}` : 'Nothing to add',
      n > 0
        ? `${n === 1 ? 'It is' : 'They are'} on your list, flagged for today.`
        : 'These were already handled.',
    )
  }
  return page(
    n > 0 ? `Dismissed ${n}` : 'Nothing to dismiss',
    n > 0 ? 'Cleared from your review queue.' : 'These were already handled.',
  )
}
