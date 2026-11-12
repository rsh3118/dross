export function DrossMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}>
      <rect x="3" y="3" width="26" height="26" rx="4" stroke="currentColor" strokeWidth="2" />
      <path d="M9 22V10h6a6 6 0 0 1 0 12H9Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="23" cy="21" r="1.5" fill="currentColor" />
    </svg>
  )
}
