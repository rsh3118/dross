'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export function CloseTab() {
  useEffect(() => {
    // Only tabs opened by script can be closed by script; otherwise this is a no-op.
    const t = window.setTimeout(() => window.close(), 800)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={() => window.close()}>
        Close tab
      </Button>
      <Link
        href="/"
        className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Open dross here
      </Link>
    </div>
  )
}
