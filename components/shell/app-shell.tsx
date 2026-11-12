'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { Sidebar, NAV } from '@/components/shell/sidebar'
import { MobileTabBar } from '@/components/shell/mobile-tab-bar'
import { MobileCapture } from '@/components/shell/mobile-capture'
import { UserMenu } from '@/components/shell/user-menu'
import { CommandPalette } from '@/components/shell/command-palette'
import { DrossMark } from '@/components/dross-mark'

export function AppShell({
  user,
  counts,
  children,
}: {
  user: { name: string; email: string }
  counts: { proposals: number; notifications: number; captured: number }
  children: React.ReactNode
}) {
  const router = useRouter()
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    let pendingG = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      if (!el) return false
      const tag = el.tagName
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
    }

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return

      if (e.key === 'g') {
        pendingG = true
        clearTimeout(timer)
        timer = setTimeout(() => (pendingG = false), 800)
        return
      }
      if (pendingG) {
        const match = NAV.find((n) => n.key === `g ${e.key}`)
        if (match) {
          e.preventDefault()
          router.push(match.href)
        }
        pendingG = false
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(timer)
    }
  }, [router])

  return (
    <div className="flex min-h-svh">
      <aside className="hidden md:flex w-56 shrink-0 border-r border-sidebar-border sticky top-0 h-svh">
        <div className="w-full">
          <Sidebar counts={counts} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2 border-b px-4 sticky top-0 bg-background/85 backdrop-blur z-20">
          <Link href="/" className="mr-auto flex items-center gap-2 md:hidden">
            <DrossMark className="size-6 text-primary" />
            <span className="font-semibold tracking-tight">dross</span>
          </Link>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hidden md:flex flex-1 max-w-md items-center gap-2 rounded-md border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/60 transition-colors"
          >
            <Search className="size-4" />
            <span className="flex-1 text-left">Search or jump to…</span>
            <kbd className="font-mono text-[10px] rounded-sm border px-1.5 py-0.5">⌘K</kbd>
          </button>

          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="md:hidden rounded-md p-2 text-muted-foreground hover:bg-muted/60"
            aria-label="Search"
          >
            <Search className="size-5" />
          </button>

          <div className="md:ml-auto">
            <UserMenu user={user} />
          </div>
        </header>

        <main className="flex-1 min-w-0 pb-24 md:pb-0">{children}</main>
      </div>

      <MobileTabBar counts={counts} />
      <MobileCapture />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  )
}
