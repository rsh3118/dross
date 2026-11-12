import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

function fromAddress() {
  const domain = process.env.RESEND_EMAIL_DOMAIN
  return domain ? `dross <hub@${domain}>` : 'dross <onboarding@resend.dev>'
}

export function notifyEmailAddress() {
  return process.env.NOTIFY_EMAIL ?? null
}

/** Sends to the owner's NOTIFY_EMAIL. Returns the Resend email id, or null if skipped/failed. */
export async function sendOwnerEmail(opts: {
  subject: string
  html: string
  text?: string
  idempotencyKey: string
}) {
  const to = notifyEmailAddress()
  if (!to) return { id: null, skipped: 'NOTIFY_EMAIL not set' as const }

  const { data, error } = await resend.emails.send(
    {
      from: fromAddress(),
      to: [to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    },
    { idempotencyKey: opts.idempotencyKey.slice(0, 256) },
  )
  if (error) {
    console.error('[email] send failed:', error.message)
    return { id: null, error: error.message }
  }
  return { id: data?.id ?? null }
}

export function wrapEmailHtml(title: string, bodyHtml: string, footer = 'Sent by your dross hub.') {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#15171d;color:#ece9e2;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
<div style="max-width:640px;margin:0 auto;padding:32px 24px;">
  <p style="font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#d9924a;margin:0 0 8px;">dross</p>
  <h1 style="font-size:22px;line-height:1.3;margin:0 0 20px;font-weight:600;">${escapeHtml(title)}</h1>
  <div style="font-size:15px;line-height:1.6;">${bodyHtml}</div>
  <hr style="border:0;border-top:1px solid rgba(255,255,255,.1);margin:32px 0 16px;">
  <p style="font-size:12px;color:#8a8f9c;margin:0;">${escapeHtml(footer)}</p>
</div></body></html>`
}

export function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

/** Small, dependency-free markdown → HTML for emails (headings, lists, links, bold, paragraphs). */
export function markdownToEmailHtml(md: string) {
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  const inline = (s: string) =>
    escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" style="color:#d9924a;">$1</a>')
      .replace(/`([^`]+)`/g, '<code style="font-family:ui-monospace,monospace;font-size:13px;background:rgba(255,255,255,.08);padding:1px 4px;border-radius:3px;">$1</code>')

  const closeList = () => {
    if (inList) {
      out.push('</ul>')
      inList = false
    }
  }
  for (const raw of lines) {
    const line = raw.trimEnd()
    if (!line.trim()) {
      closeList()
      continue
    }
    const h = line.match(/^(#{1,3})\s+(.*)/)
    if (h) {
      closeList()
      const size = h[1].length === 1 ? 20 : h[1].length === 2 ? 17 : 15
      out.push(`<h2 style="font-size:${size}px;margin:24px 0 8px;font-weight:600;">${inline(h[2])}</h2>`)
      continue
    }
    const li = line.match(/^\s*[-*]\s+(.*)/)
    if (li) {
      if (!inList) {
        out.push('<ul style="padding-left:20px;margin:0 0 12px;">')
        inList = true
      }
      out.push(`<li style="margin:4px 0;">${inline(li[1])}</li>`)
      continue
    }
    closeList()
    out.push(`<p style="margin:0 0 12px;">${inline(line)}</p>`)
  }
  closeList()
  return out.join('\n')
}
