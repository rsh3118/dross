'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DrossMark } from '@/components/dross-mark'

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.55-5.17 3.55-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.94-2.91l-3.87-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.29 5.38l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  )
}

const AGENTS = ['research', 'housekeeping', 'newsletter', 'code']

export function AuthForm({
  mode,
  hasOwner,
  initialError,
}: {
  mode: 'sign-in' | 'sign-up'
  hasOwner: boolean
  initialError?: string | null
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(initialError ?? null)
  const [loading, setLoading] = useState(false)
  const [googleState, setGoogleState] = useState<'idle' | 'opening' | 'waiting'>('idle')
  const [showEmail, setShowEmail] = useState(false)
  const popupRef = useRef<Window | null>(null)

  const isSignUp = mode === 'sign-up'
  const signUpClosed = isSignUp && hasOwner

  // When Google finishes in a separate tab (iframe case), pick the session up here.
  useEffect(() => {
    if (googleState !== 'waiting') return
    const timer = window.setInterval(async () => {
      const { data } = await authClient.getSession()
      if (data?.user) {
        window.clearInterval(timer)
        popupRef.current?.close()
        router.push('/')
        router.refresh()
        return
      }
      if (popupRef.current?.closed) {
        window.clearInterval(timer)
        setGoogleState('idle')
      }
    }, 1500)
    return () => window.clearInterval(timer)
  }, [googleState, router])

  const handleGoogle = async () => {
    setError(null)
    const framed = window.self !== window.top
    // Google won't render inside an iframe and popup blockers require the
    // window to be opened synchronously in the click handler, before any await.
    const popup = framed ? window.open('', '_blank') : null
    if (framed && !popup) {
      setError('Your browser blocked the Google window. Allow popups for this site and try again.')
      return
    }
    popupRef.current = popup
    setGoogleState('opening')

    const { data, error } = await authClient.signIn.social({
      provider: 'google',
      callbackURL: framed ? '/auth/done' : '/',
      errorCallbackURL: '/sign-in?error=google',
      disableRedirect: framed,
    })

    if (error || !data?.url) {
      popup?.close()
      console.error('[auth] google', error?.status, error?.code)
      setGoogleState('idle')
      setError('Google sign-in is unavailable right now.')
      return
    }

    if (framed && popup) {
      popup.location.href = data.url
      setGoogleState('waiting')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = isSignUp
      ? await authClient.signUp.email({ email, password, name })
      : await authClient.signIn.email({ email, password })

    setLoading(false)

    if (error) {
      console.error('[auth]', error.status, error.code)
      setError(
        isSignUp ? (error.message ?? 'Could not create the account.') : 'Invalid email or password.',
      )
      return
    }

    router.push('/')
    router.refresh()
  }

  const googleLabel =
    googleState === 'opening'
      ? 'Opening Google…'
      : googleState === 'waiting'
        ? 'Finish signing in with Google in the other tab'
        : 'Continue with Google'

  return (
    <main className="min-h-svh bg-background text-foreground flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-4xl grid md:grid-cols-[1.1fr_1fr] rounded-xl border bg-card overflow-hidden shadow-2xl shadow-black/20">
        <section className="relative hidden md:flex flex-col justify-between gap-12 p-10 bg-sidebar border-r">
          <div className="flex items-center gap-3">
            <DrossMark className="size-8 text-primary" />
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              personal hub
            </span>
          </div>

          <div className="flex flex-col gap-5">
            <h1 className="text-5xl font-semibold tracking-tight leading-none text-balance">dross</h1>
            <p className="text-base text-muted-foreground leading-relaxed text-pretty max-w-xs">
              What&apos;s left after the day burns down: tasks, notes, and four agents that work while
              you don&apos;t.
            </p>
          </div>

          <ul className="flex flex-wrap gap-2" aria-label="Agents">
            {AGENTS.map((a) => (
              <li
                key={a}
                className="font-mono text-[11px] uppercase tracking-wider px-2.5 py-1 rounded-full border border-primary/30 text-primary bg-primary/10"
              >
                {a}
              </li>
            ))}
          </ul>
        </section>

        <section className="flex flex-col justify-center gap-8 p-8 sm:p-10">
          <div className="flex items-center gap-3 md:hidden">
            <DrossMark className="size-7 text-primary" />
            <span className="text-lg font-semibold tracking-tight">dross</span>
          </div>

          <div className="flex flex-col gap-1.5">
            <h2 className="text-2xl font-semibold tracking-tight">
              {isSignUp ? 'Claim this hub' : 'Welcome back'}
            </h2>
            <p className="text-sm text-muted-foreground text-pretty">
              {isSignUp
                ? 'Create the single owner account. Sign-up closes after this.'
                : hasOwner
                  ? 'Sign in with the owner account.'
                  : 'No owner yet. The first sign-in claims this hub.'}
            </p>
          </div>

          {signUpClosed ? (
            <p className="text-sm text-muted-foreground">
              This hub already has an owner.{' '}
              <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
                Sign in
              </Link>
              .
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              <Button
                type="button"
                size="lg"
                className="w-full h-12 gap-3 text-base font-medium"
                onClick={handleGoogle}
                disabled={googleState !== 'idle'}
              >
                <span className="grid place-items-center size-6 rounded-full bg-card">
                  <GoogleIcon className="size-3.5" />
                </span>
                {googleLabel}
              </Button>

              {googleState === 'waiting' && (
                <p className="text-xs text-muted-foreground text-center text-pretty">
                  This page will continue automatically once you approve in the Google tab.
                </p>
              )}

              {error && !showEmail && (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              )}

              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <button
                  type="button"
                  onClick={() => setShowEmail((v) => !v)}
                  className="font-mono uppercase tracking-wider hover:text-foreground"
                  aria-expanded={showEmail}
                >
                  {showEmail ? 'hide email' : 'or use email'}
                </button>
                <span className="h-px flex-1 bg-border" />
              </div>

              {showEmail && (
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  {isSignUp && (
                    <div className="flex flex-col gap-2">
                      <Label htmlFor="name">Name</Label>
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        autoComplete="name"
                      />
                    </div>
                  )}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive" role="alert">
                      {error}
                    </p>
                  )}

                  <Button type="submit" variant="outline" disabled={loading} className="w-full">
                    {loading ? 'Please wait…' : isSignUp ? 'Create owner account' : 'Sign in with email'}
                  </Button>
                </form>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {isSignUp ? (
              <>
                Already the owner?{' '}
                <Link href="/sign-in" className="text-foreground underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </>
            ) : (
              'Single-owner hub. Only the owner account can sign in.'
            )}
          </p>
        </section>
      </div>
    </main>
  )
}
