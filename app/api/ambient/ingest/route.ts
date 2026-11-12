import { put } from '@vercel/blob'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recordings, settings } from '@/lib/db/schema'
import { userIdForRecorderToken } from '@/lib/ambient'

// Blob + DB need the Node runtime (not edge).
export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_BYTES = 25 * 1024 * 1024 // Whisper hard-limits at 25MB; reject larger chunks.

function bearer(req: NextRequest) {
  const h = req.headers.get('authorization') ?? ''
  return h.toLowerCase().startsWith('bearer ') ? h.slice(7).trim() : ''
}

// Cheap credential check the recorder page calls before it starts capturing.
export async function GET(req: NextRequest) {
  const userId = await userIdForRecorderToken(bearer(req))
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 })
  const [cfg] = await db.select().from(settings).where(eq(settings.userId, userId))
  return NextResponse.json({ ok: true, enabled: cfg?.ambientEnabled ?? true })
}

export async function POST(req: NextRequest) {
  const userId = await userIdForRecorderToken(bearer(req))
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Respect the master switch: accept but drop while capture is paused.
  const [cfg] = await db.select().from(settings).where(eq(settings.userId, userId))
  if (cfg && !cfg.ambientEnabled) return NextResponse.json({ ok: true, skipped: 'disabled' })

  const form = await req.formData()
  const file = form.get('audio')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No audio' }, { status: 400 })
  }
  if (file.size < 1024) {
    // Near-empty chunk (silence / immediate stop) — nothing worth storing.
    return NextResponse.json({ ok: true, skipped: 'too-small' })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Chunk too large' }, { status: 413 })
  }

  const room = String(form.get('room') ?? 'room')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 32) || 'room'
  const durationMs = Number(form.get('durationMs')) || null
  const ext = file.type.includes('mp4') ? 'mp4' : file.type.includes('ogg') ? 'ogg' : 'webm'
  const pathname = `ambient/${userId}/${room}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

  const blob = await put(pathname, file, {
    access: 'private',
    contentType: file.type || 'audio/webm',
  })

  const [row] = await db
    .insert(recordings)
    .values({
      userId,
      room,
      blobPathname: blob.pathname,
      durationMs,
      bytes: file.size,
      status: 'uploaded',
    })
    .returning({ id: recordings.id })

  return NextResponse.json({ ok: true, id: row.id })
}
