import { and, eq, isNull, ne, or, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { settings, tasks, user } from '@/lib/db/schema'
import { HABIT_TZ, habitOnMiss, isHabit, periodKeyFor } from '@/lib/tasks'
import { processAmbient } from '@/lib/ambient-process'
import {
  enqueueHousekeeping,
  enqueueNewsletter,
  enqueueNotify,
  enqueueResearch,
} from '@/lib/agents/enqueue'

export const maxDuration = 60

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization')
  return header === `Bearer ${secret}`
}

export async function GET(req: Request, ctx: { params: Promise<{ agent: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { agent } = await ctx.params

  const owners = await db.select({ id: user.id }).from(user).limit(1)
  if (owners.length === 0) return NextResponse.json({ skipped: 'no owner yet' })
  const userId = owners[0].id
  const [s] = await db.select().from(settings).where(eq(settings.userId, userId))

  switch (agent) {
    case 'research': {
      if (s && !s.researchAuto) return NextResponse.json({ skipped: 'research_auto disabled' })
      const pending = await db
        .select({ id: tasks.id, title: tasks.title, description: tasks.description })
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            eq(tasks.isResearch, true),
            isNull(tasks.researchRunId),
            isNull(tasks.archivedAt),
            ne(tasks.status, 'done'),
            ne(tasks.status, 'skipped'),
          ),
        )
        .limit(3)
      const runs = []
      for (const t of pending) {
        runs.push(
          await enqueueResearch({
            userId,
            taskId: t.id,
            topic: t.description ? `${t.title}\n\n${t.description}` : t.title,
            trigger: 'cron',
          }),
        )
      }
      return NextResponse.json({ started: runs.length })
    }
    case 'housekeeping': {
      if (s && !s.housekeepingEnabled) return NextResponse.json({ skipped: 'housekeeping disabled' })
      return NextResponse.json(await enqueueHousekeeping(userId, 'cron'))
    }
    case 'newsletter': {
      // Cron fires hourly; only run at the configured weekday + hour in the owner's timezone.
      const tz = s?.timezone ?? 'UTC'
      const now = new Date()
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(now)
      const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? '')
      const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1) % 24
      const wantDay = s?.newsletterDay ?? 1
      const wantHour = s?.newsletterHour ?? 8
      if (weekday !== wantDay || hour !== wantHour) {
        return NextResponse.json({ skipped: `not scheduled (now ${weekday}@${hour}, want ${wantDay}@${wantHour} ${tz})` })
      }
      return NextResponse.json(await enqueueNewsletter(userId, 'cron'))
    }
    case 'notify':
      return NextResponse.json(await enqueueNotify(userId, 'cron'))
    case 'ambient': {
      // Transcribe uploaded room audio, extract tasks into the review queue,
      // and email the owner asking whether to add them.
      if (s && !s.ambientEnabled) return NextResponse.json({ skipped: 'ambient disabled' })
      return NextResponse.json(await processAmbient(userId, { email: true }))
    }
    case 'rollover': {
      // Recurrence engine. Runs hourly; acts only when a task's period actually
      // rolls (habit-day boundary = 4am America/New_York). Reopens recurring
      // tasks, flags daily/weekly habits back onto Today/Week, decrements habit
      // shields on a miss, and retires bounded "for the next X …" repeats.
      const recurring = await db
        .select()
        .from(tasks)
        .where(and(ne(tasks.recurrence, 'none'), isNull(tasks.archivedAt)))

      let reopened = 0
      let missed = 0
      let ended = 0

      for (const t of recurring) {
        const current = periodKeyFor(t.recurrence)
        if (t.lastPeriodKey === current) continue // still the same period

        const completedPrev =
          t.lastCompletedPeriodKey != null && t.lastCompletedPeriodKey === t.lastPeriodKey

        const patch: Record<string, unknown> = {
          lastPeriodKey: current,
          status: 'not_started',
          updatedAt: new Date(),
        }

        if (isHabit(t.recurrence)) {
          if (!completedPrev && t.habitTier > 0) {
            Object.assign(patch, habitOnMiss(t))
            missed += 1
          }
          if (t.recurrence === 'daily') patch.today = true
          if (t.recurrence === 'weekly') patch.thisWeek = true
        } else {
          // Bounded repeat: count down and retire when exhausted.
          const remaining = (t.recurrenceRemaining ?? t.recurrenceCount ?? 1) - 1
          if (remaining <= 0) {
            patch.recurrence = 'none'
            patch.recurrenceRemaining = null
            ended += 1
          } else {
            patch.recurrenceRemaining = remaining
          }
          if (t.recurrence === 'days') patch.today = true
          if (t.recurrence === 'weeks') patch.thisWeek = true
        }

        await db.update(tasks).set(patch).where(eq(tasks.id, t.id))
        reopened += 1
      }

      // Everything below runs once per day, gated on the habit-day boundary
      // hour (4am ET) even though this cron fires hourly.
      let flagged = 0
      let cleaned = 0
      const hourNow = Number(
        new Intl.DateTimeFormat('en-US', { timeZone: HABIT_TZ, hour: 'numeric', hour12: false }).format(
          new Date(),
        ),
      ) % 24
      if (hourNow === 4) {
        // Auto-pin to Today: any open task whose due date has arrived (due
        // today or earlier, compared by calendar date in the habit timezone)
        // gets `today` clicked on automatically, same as if the user had
        // starred it themselves.
        const dueNow = await db
          .update(tasks)
          .set({ today: true, updatedAt: new Date() })
          .where(
            and(
              eq(tasks.userId, userId),
              eq(tasks.today, false),
              isNull(tasks.archivedAt),
              ne(tasks.status, 'done'),
              ne(tasks.status, 'skipped'),
              sql`${tasks.dueAt} is not null and (${tasks.dueAt} at time zone ${HABIT_TZ})::date <= (now() at time zone ${HABIT_TZ})::date`,
            ),
          )
          .returning({ id: tasks.id })
        flagged = dueNow.length

        // End-of-day cleanup, run right after habits refresh above: archive
        // (rather than hard-delete) one-off done/skipped tasks so the board
        // clears out daily without destroying history. Recurring tasks are
        // excluded — they're already reopened by the loop above.
        const finished = await db
          .update(tasks)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(
            and(
              eq(tasks.userId, userId),
              eq(tasks.recurrence, 'none'),
              isNull(tasks.archivedAt),
              or(eq(tasks.status, 'done'), eq(tasks.status, 'skipped')),
            ),
          )
          .returning({ id: tasks.id })
        cleaned = finished.length
      }

      return NextResponse.json({ reopened, missed, ended, flagged, cleaned })
    }
    default:
      return NextResponse.json({ error: 'Unknown agent' }, { status: 404 })
  }
}
