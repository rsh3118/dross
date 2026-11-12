'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Radio, TriangleAlert, Wifi, WifiOff } from 'lucide-react'

const CHUNK_MS = 30_000
const ROOMS = [
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'living-room', label: 'Living room' },
]

type Phase = 'setup' | 'recording' | 'muted' | 'error'

function pickMime() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']
  if (typeof MediaRecorder === 'undefined') return ''
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? ''
}

export function Recorder() {
  const [phase, setPhase] = useState<Phase>('setup')
  const [room, setRoom] = useState('bedroom')
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploads, setUploads] = useState(0)
  const [lastUpload, setLastUpload] = useState<Date | null>(null)
  const [online, setOnline] = useState(true)

  const tokenRef = useRef('')
  const roomRef = useRef('bedroom')
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const mimeRef = useRef('')
  const stoppedRef = useRef(true)
  const mutedRef = useRef(false)
  const wakeRef = useRef<WakeLockSentinel | null>(null)
  const cycleStartRef = useRef(0)

  const teardown = useCallback(() => {
    stoppedRef.current = true
    try {
      if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
    } catch {
      /* ignore */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    wakeRef.current?.release().catch(() => {})
    wakeRef.current = null
  }, [])

  const upload = useCallback(async (blob: Blob, durationMs: number) => {
    if (blob.size < 1024) return
    const ext = mimeRef.current.includes('mp4')
      ? 'mp4'
      : mimeRef.current.includes('ogg')
        ? 'ogg'
        : 'webm'
    const fd = new FormData()
    fd.append('audio', blob, `chunk.${ext}`)
    fd.append('room', roomRef.current)
    fd.append('durationMs', String(durationMs))
    try {
      const res = await fetch('/api/ambient/ingest', {
        method: 'POST',
        headers: { authorization: `Bearer ${tokenRef.current}` },
        body: fd,
      })
      if (res.status === 401) {
        setError('Recorder key was rejected. Re-enter it to continue.')
        teardown()
        setPhase('setup')
        return
      }
      if (res.ok) {
        setUploads((n) => n + 1)
        setLastUpload(new Date())
      }
    } catch {
      // Network blip — the next chunk will try again.
    }
  }, [teardown])

  const startCycle = useCallback(() => {
    const stream = streamRef.current
    if (!stream || stoppedRef.current || mutedRef.current) return
    let rec: MediaRecorder
    try {
      rec = mimeRef.current
        ? new MediaRecorder(stream, { mimeType: mimeRef.current })
        : new MediaRecorder(stream)
    } catch {
      setError('This browser cannot record audio.')
      setPhase('error')
      return
    }
    const chunks: BlobPart[] = []
    cycleStartRef.current = Date.now()
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    rec.onstop = () => {
      const dur = Date.now() - cycleStartRef.current
      const blob = new Blob(chunks, { type: mimeRef.current || 'audio/webm' })
      void upload(blob, dur)
      if (!stoppedRef.current && !mutedRef.current) startCycle()
    }
    recRef.current = rec
    rec.start()
    window.setTimeout(() => {
      if (rec.state !== 'inactive') rec.stop()
    }, CHUNK_MS)
  }, [upload])

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) wakeRef.current = await navigator.wakeLock.request('screen')
    } catch {
      /* screen may sleep; capture still runs while foreground */
    }
  }, [])

  const begin = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/ambient/ingest', {
        headers: { authorization: `Bearer ${tokenRef.current}` },
      })
      if (!res.ok) {
        setError('That recorder key is not valid.')
        setPhase('setup')
        return
      }
    } catch {
      setError('Could not reach the server. Check the connection.')
      setPhase('setup')
      return
    }
    try {
      streamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
      })
    } catch {
      setError('Microphone permission denied. Allow the mic and try again.')
      setPhase('error')
      return
    }
    mimeRef.current = pickMime()
    stoppedRef.current = false
    mutedRef.current = false
    localStorage.setItem('dross_recorder_room', roomRef.current)
    await requestWakeLock()
    setPhase('recording')
    startCycle()
  }, [requestWakeLock, startCycle])

  // Resolve room (query) + key (hash → localStorage) on mount; auto-start when
  // a key came in via the URL hash so a room device needs zero interaction.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const qRoom = params.get('room')
    const storedRoom = localStorage.getItem('dross_recorder_room')
    const resolvedRoom = qRoom || storedRoom || 'bedroom'
    roomRef.current = resolvedRoom
    setRoom(resolvedRoom)

    const hashKey = hash.get('key')
    const storedKey = localStorage.getItem('dross_recorder_key')
    const key = hashKey || storedKey || ''
    if (key) {
      tokenRef.current = key
      localStorage.setItem('dross_recorder_key', key)
      setKeyInput(key)
    }
    if (hashKey) {
      // Strip the key from the visible URL, then auto-connect.
      history.replaceState(null, '', window.location.pathname + window.location.search)
      void begin()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    setOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && !stoppedRef.current) requestWakeLock()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [requestWakeLock])

  useEffect(() => () => teardown(), [teardown])

  const connect = useCallback(() => {
    const k = keyInput.trim()
    if (!k) {
      setError('Enter your recorder key.')
      return
    }
    tokenRef.current = k
    roomRef.current = room
    localStorage.setItem('dross_recorder_key', k)
    void begin()
  }, [keyInput, room, begin])

  const toggleMute = useCallback(() => {
    if (mutedRef.current) {
      mutedRef.current = false
      setPhase('recording')
      void requestWakeLock()
      startCycle()
    } else {
      mutedRef.current = true
      setPhase('muted')
      try {
        if (recRef.current && recRef.current.state !== 'inactive') recRef.current.stop()
      } catch {
        /* ignore */
      }
    }
  }, [requestWakeLock, startCycle])

  // ---------- Setup screen ----------
  if (phase === 'setup') {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6 py-10">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase tracking-[0.15em] text-primary">dross recorder</p>
          <h1 className="text-2xl font-semibold text-balance">Set up this room</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Pick the room and paste the recorder key from Capture. This device will listen and
            upload continuously until you mute it.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="room" className="text-sm font-medium">
            Room
          </label>
          <select
            id="room"
            value={room}
            onChange={(e) => {
              setRoom(e.target.value)
              roomRef.current = e.target.value
            }}
            className="h-11 rounded-lg border bg-card px-3 text-base"
          >
            {ROOMS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="key" className="text-sm font-medium">
            Recorder key
          </label>
          <input
            id="key"
            type="password"
            inputMode="text"
            autoComplete="off"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            placeholder="Paste key"
            className="h-11 rounded-lg border bg-card px-3 text-base"
          />
        </div>
        {error && (
          <p className="flex items-center gap-2 text-sm text-destructive">
            <TriangleAlert className="size-4 shrink-0" /> {error}
          </p>
        )}
        <button
          type="button"
          onClick={connect}
          className="h-12 rounded-lg bg-primary text-base font-medium text-primary-foreground"
        >
          Start listening
        </button>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Keep this screen open and the phone on its charger. Recording pauses if you mute it.
        </p>
      </div>
    )
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-5 px-6 text-center">
        <TriangleAlert className="size-10 text-destructive" />
        <p className="text-pretty text-base">{error ?? 'Something went wrong.'}</p>
        <button
          type="button"
          onClick={() => {
            setPhase('setup')
            setError(null)
          }}
          className="h-11 rounded-lg border px-5 text-sm font-medium"
        >
          Back to setup
        </button>
      </div>
    )
  }

  // ---------- Live screen ----------
  const recording = phase === 'recording'
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-between px-6 py-10">
      <header className="flex w-full items-center justify-between">
        <p className="font-mono text-xs uppercase tracking-[0.15em] text-primary">dross recorder</p>
        <span
          className={`flex items-center gap-1.5 text-xs ${online ? 'text-muted-foreground' : 'text-destructive'}`}
        >
          {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
          {online ? 'Online' : 'Offline'}
        </span>
      </header>

      <div className="flex flex-col items-center gap-6">
        <div
          className={`relative flex size-44 items-center justify-center rounded-full border-2 ${
            recording ? 'border-destructive/60' : 'border-border'
          }`}
        >
          {recording && (
            <span className="absolute inset-0 animate-ping rounded-full bg-destructive/20" />
          )}
          {recording ? (
            <Radio className="size-16 text-destructive" />
          ) : (
            <MicOff className="size-16 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-3xl font-semibold capitalize">{room.replace('-', ' ')}</p>
          <p className={`text-sm ${recording ? 'text-destructive' : 'text-muted-foreground'}`}>
            {recording ? 'Listening and uploading' : 'Muted — nothing is being recorded'}
          </p>
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-6">
        <button
          type="button"
          onClick={toggleMute}
          className={`flex h-16 w-full items-center justify-center gap-2.5 rounded-2xl text-lg font-medium transition-colors ${
            recording ? 'bg-muted text-foreground' : 'bg-destructive text-destructive-foreground'
          }`}
        >
          {recording ? (
            <>
              <MicOff className="size-5" /> Mute
            </>
          ) : (
            <>
              <Mic className="size-5" /> Resume
            </>
          )}
        </button>
        <dl className="flex w-full items-center justify-center gap-8 text-center">
          <div className="flex flex-col gap-0.5">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Chunks sent
            </dt>
            <dd className="text-xl tabular-nums">{uploads}</dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Last upload
            </dt>
            <dd className="text-xl tabular-nums">
              {lastUpload
                ? lastUpload.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '—'}
            </dd>
          </div>
        </dl>
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Keep this screen open and plugged in. Uploads happen every 30 seconds.
        </p>
      </div>
    </div>
  )
}
