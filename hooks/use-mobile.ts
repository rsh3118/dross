'use client'

import * as React from 'react'

const MOBILE_BREAKPOINT = 768

// Matches Tailwind's `md` breakpoint so JS-driven variants (bottom sheet vs side
// sheet, forced list view) stay in sync with the CSS `md:` utilities.
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    mql.addEventListener('change', onChange)
    onChange()
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return !!isMobile
}
