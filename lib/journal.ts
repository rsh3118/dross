import type {
  DailyJournalBody,
  JournalType,
  BoojibooJournalBody,
} from '@/lib/db/schema'

// `import type` keeps this file free of the drizzle runtime, so it is safe to
// import from client components.

export const emptyDailyBody = (): DailyJournalBody => ({
  feelings: [],
  wentWell: [],
  wentPoorly: [],
  lessonsShort: [],
  lessonsMedium: [],
  lessonsLong: [],
  interactions: [],
  timeSpent: [],
})

export const emptyRelationshipBody = (): BoojibooJournalBody => ({
  appreciations: [],
})

export const emptyBodyFor = (type: JournalType) =>
  type === 'daily' ? emptyDailyBody() : emptyRelationshipBody()

export const JOURNAL_TABS = [
  { value: 'daily', label: 'Daily' },
  { value: 'relationship', label: 'Boojiboo' },
] as const

export function formatEntryDate(date: Date | string) {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
