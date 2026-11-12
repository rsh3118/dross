import { get } from '@vercel/blob'
import { Output, experimental_transcribe as transcribe, gateway, generateText } from 'ai'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { capturedTasks, recordings, settings, tasks } from '@/lib/db/schema'
import { roomLabel, signAction } from '@/lib/ambient'
import { escapeHtml, sendOwnerEmail, wrapEmailHtml } from '@/lib/email'

const TRANSCRIBE_MODEL = 'openai/whisper-1'
const EXTRACT_MODEL = 'openai/gpt-4.1-mini'

// Whisper invents filler on silence/noise. Drop transcripts that are just these.
const HALLUCINATIONS = new Set([
  'thank you',
  'thanks for watching',
  'you',
  'thank you.',
  'bye',
  '.',
  'okay',
  'so',
])

export function appBaseUrl() {
  return (
    process.env.BETTER_AUTH_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.V0_RUNTIME_URL ?? 'http://localhost:3000'))
  )
}

function looksEmpty(text: string) {
  const t = text.trim().toLowerCase()
  if (t.length < 12) return true
  if (HALLUCINATIONS.has(t.replace(/[.!?]+$/, ''))) return true
  const words = t.split(/\s+/).filter(Boolean)
  return words.length < 4
}

const extractionSchema = z.object({
  tasks: z
    .array(
      z.object({
        title: z.string().describe('Short imperative task title, e.g. "Buy cat food".'),
        group: z.enum(['personal', 'work']),
        note: z.string().nullable().describe('Optional one-line detail, or null.'),
      }),
    )
    .describe('Actionable tasks explicitly stated aloud. Empty if none.'),
})

async function transcribeOne(pathname: string): Promise<string> {
  const blob = await get(pathname, { access: 'private' })
  if (!blob || blob.statusCode !== 200) throw new Error('blob unavailable')
  const buf = new Uint8Array(await new Response(blob.stream).arrayBuffer())
  const result = await transcribe({
    model: gateway.transcription(TRANSCRIBE_MODEL),
    audio: buf,
  })
  return result.text ?? ''
}

async function extractTasks(transcript: string) {
  const { experimental_output } = await generateText({
    model: EXTRACT_MODEL,
    experimental_output: Output.object({ schema: extractionSchema }),
    system:
      'You extract to-do items from a raw transcript of ambient speech in a home. ' +
      'Only capture clear, actionable tasks the speaker committed to or asked to be reminded of ' +
      '(e.g. "remind me to...", "I need to...", "don\'t forget to...", "we should book..."). ' +
      'Ignore small talk, questions, opinions, media audio, and anything ambiguous. ' +
      'Prefer returning an empty list over guessing. Keep titles short and imperative.',
    prompt: `Transcript:\n"""\n${transcript}\n"""`,
  })
  return experimental_output.tasks ?? []
}

/**
 * Process the ambient pipeline for one owner:
 *  1. transcribe uploaded chunks,
 *  2. extract tasks into the review queue,
 *  3. optionally email a digest asking for approval.
 * Designed to be called from cron; safe to run repeatedly.
 */
export async function processAmbient(
  userId: string,
  opts: { maxChunks?: number; email?: boolean } = {},
) {
  const maxChunks = opts.maxChunks ?? 8
  const [cfg] = await db.select().from(settings).where(eq(settings.userId, userId))
  if (cfg && !cfg.ambientEnabled) return { skipped: 'disabled' as const }

  const pending = await db
    .select()
    .from(recordings)
    .where(and(eq(recordings.userId, userId), eq(recordings.status, 'uploaded')))
    .orderBy(recordings.createdAt)
    .limit(maxChunks)

  let transcribed = 0
  let empty = 0
  let created = 0

  for (const rec of pending) {
    try {
      const text = await transcribeOne(rec.blobPathname)
      if (looksEmpty(text)) {
        await db
          .update(recordings)
          .set({ status: 'empty', transcript: text || null, processedAt: new Date() })
          .where(eq(recordings.id, rec.id))
        empty += 1
        continue
      }
      await db
        .update(recordings)
        .set({ status: 'transcribed', transcript: text })
        .where(eq(recordings.id, rec.id))
      transcribed += 1

      const found = await extractTasks(text)
      for (const t of found) {
        await db.insert(capturedTasks).values({
          userId,
          recordingId: rec.id,
          kind: 'create',
          title: t.title.slice(0, 200),
          group: t.group === 'work' ? 'work' : 'personal',
          payload: t.note ? { note: t.note } : {},
          excerpt: text.slice(0, 400),
          status: 'pending',
        })
        created += 1
      }
      await db
        .update(recordings)
        .set({ status: 'processed', processedAt: new Date() })
        .where(eq(recordings.id, rec.id))
    } catch (err) {
      await db
        .update(recordings)
        .set({
          status: 'failed',
          error: err instanceof Error ? err.message.slice(0, 300) : 'unknown',
          processedAt: new Date(),
        })
        .where(eq(recordings.id, rec.id))
    }
  }

  let emailed = false
  if (opts.email && (cfg?.ambientEmailApproval ?? true)) {
    emailed = await maybeSendDigest(userId)
  }

  return { transcribed, empty, created, emailed }
}

/** Email the owner the pending queue with approve/dismiss-all links. */
export async function maybeSendDigest(userId: string) {
  const pending = await db
    .select()
    .from(capturedTasks)
    .where(and(eq(capturedTasks.userId, userId), eq(capturedTasks.status, 'pending')))
    .orderBy(desc(capturedTasks.createdAt))
    .limit(50)

  if (pending.length === 0) return false

  const base = appBaseUrl()
  const link = (action: 'approve' | 'dismiss') =>
    `${base}/api/ambient/act?u=${encodeURIComponent(userId)}&a=${action}&s=all&sig=${signAction(userId, action, 'all')}`

  const items = pending
    .map((c) => {
      const note = (c.payload as { note?: string })?.note
      return `<li style="margin:6px 0;"><strong>${escapeHtml(c.title)}</strong> <span style="color:#8a8f9c;">· ${escapeHtml(c.group)}</span>${
        note ? `<br><span style="color:#8a8f9c;font-size:13px;">${escapeHtml(note)}</span>` : ''
      }</li>`
    })
    .join('')

  const btn = (href: string, label: string, bg: string, color: string) =>
    `<a href="${href}" style="display:inline-block;padding:10px 20px;border-radius:8px;background:${bg};color:${color};text-decoration:none;font-weight:600;font-size:14px;">${label}</a>`

  const body = `
    <p style="margin:0 0 16px;">I overheard ${pending.length} possible task${pending.length === 1 ? '' : 's'} in your rooms. Want me to add ${pending.length === 1 ? 'it' : 'them'}?</p>
    <ul style="padding-left:20px;margin:0 0 24px;">${items}</ul>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px;">
      ${btn(link('approve'), `Add ${pending.length === 1 ? 'it' : 'all'}`, '#d9924a', '#15171d')}
      ${btn(link('dismiss'), 'Dismiss all', 'rgba(255,255,255,.08)', '#ece9e2')}
    </div>
    <p style="margin:0;font-size:13px;color:#8a8f9c;">Or <a href="${base}/capture" style="color:#d9924a;">open the review queue</a> to pick and choose.</p>
  `

  const res = await sendOwnerEmail({
    subject: `dross overheard ${pending.length} task${pending.length === 1 ? '' : 's'}`,
    html: wrapEmailHtml('Add these to your list?', body),
    idempotencyKey: `ambient-digest-${userId}-${pending[0].id}`,
  })
  if (res.id || res.skipped) {
    await db
      .update(settings)
      .set({ ambientLastEmailedAt: new Date() })
      .where(eq(settings.userId, userId))
  }
  return Boolean(res.id)
}

/**
 * Approve or dismiss captured tasks for a user, scoped either to a single id
 * or to the whole pending queue ("all"). Approving inserts a real task in the
 * user's Personal/Work list. Returns how many were resolved. Idempotent:
 * already-resolved rows are ignored because we only match status = 'pending'.
 */
export async function resolveCaptured(
  userId: string,
  action: 'approve' | 'dismiss',
  scope: number | 'all',
) {
  const rows = await db
    .select()
    .from(capturedTasks)
    .where(
      scope === 'all'
        ? and(eq(capturedTasks.userId, userId), eq(capturedTasks.status, 'pending'))
        : and(
            eq(capturedTasks.userId, userId),
            eq(capturedTasks.id, scope),
            eq(capturedTasks.status, 'pending'),
          ),
    )

  let resolved = 0
  for (const c of rows) {
    if (action === 'approve') {
      const note = (c.payload as { note?: string })?.note
      await db.insert(tasks).values({
        userId,
        title: c.title,
        description: note ?? null,
        group: c.group,
        type: 'errand',
        today: true,
        tags: ['captured'],
      })
    }
    await db
      .update(capturedTasks)
      .set({ status: action === 'approve' ? 'approved' : 'dismissed', resolvedAt: new Date() })
      .where(eq(capturedTasks.id, c.id))
    resolved += 1
  }
  return resolved
}

export { roomLabel }
