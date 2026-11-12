type Input = { userId: string; agentRunId: number }

export async function notifyWorkflow(input: Input) {
  'use workflow'

  await begin(input.agentRunId)
  try {
    const scan = await scanTasks(input.agentRunId, input.userId)
    if (scan.items.length === 0) {
      await complete(input.agentRunId, 'Nothing urgent', false)
      return { sent: false }
    }
    const brief = await writeBrief(input.agentRunId, scan)
    const sent = await send(input.agentRunId, input.userId, brief, scan.quiet)
    await complete(input.agentRunId, `${scan.items.length} item${scan.items.length === 1 ? '' : 's'} flagged`, sent)
    return { sent }
  } catch (err) {
    await fail(input.agentRunId, err instanceof Error ? err.message : String(err))
    throw err
  }
}

async function begin(agentRunId: number) {
  'use step'
  const { setRunStatus, appendLog } = await import('@/lib/agents/runlog')
  await setRunStatus(agentRunId, 'running')
  await appendLog(agentRunId, 'Scanning due and overdue tasks')
}

type Scan = {
  items: { id: number; title: string; priority: string; dueAt: string | null; state: 'overdue' | 'today' | 'soon' | 'urgent' }[]
  quiet: boolean
  emailEnabled: boolean
}

async function scanTasks(agentRunId: number, userId: string): Promise<Scan> {
  'use step'
  const { db } = await import('@/lib/db')
  const { tasks, settings, notifications } = await import('@/lib/db/schema')
  const { and, eq, gte, isNull, ne } = await import('drizzle-orm')
  const { appendLog } = await import('@/lib/agents/runlog')

  const [s] = await db.select().from(settings).where(eq(settings.userId, userId))
  const tz = s?.timezone ?? 'UTC'
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz }).format(new Date()))
  const qs = s?.quietStart ?? 22
  const qe = s?.quietEnd ?? 7
  const quiet = qs > qe ? hour >= qs || hour < qe : hour >= qs && hour < qe

  const open = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        isNull(tasks.archivedAt),
        ne(tasks.status, 'done'),
        ne(tasks.status, 'skipped'),
      ),
    )

  const now = Date.now()
  const dayMs = 86_400_000
  const items: Scan['items'] = []
  for (const t of open) {
    const due = t.dueAt?.getTime() ?? null
    let state: Scan['items'][number]['state'] | null = null
    if (due !== null && due < now) state = 'overdue'
    else if (due !== null && due - now < dayMs) state = 'today'
    else if (
      due !== null &&
      due - now < 3 * dayMs &&
      (t.priority === 'urgent' || t.priority === 'necessary' || t.priority === 'important')
    )
      state = 'soon'
    else if (t.priority === 'urgent') state = 'urgent'
    if (state) items.push({ id: t.id, title: t.title, priority: t.priority, dueAt: t.dueAt?.toISOString() ?? null, state })
  }

  // Skip if we already briefed within the last 5 hours
  const recent = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.kind, 'due_soon'), gte(notifications.createdAt, new Date(now - 5 * 3_600_000))))
    .limit(1)

  if (recent.length) {
    await appendLog(agentRunId, 'Briefed recently; skipping to avoid noise')
    return { items: [], quiet, emailEnabled: s?.notifyEmail ?? true }
  }

  await appendLog(agentRunId, `${items.length} flagged · quiet hours: ${quiet ? 'yes' : 'no'}`)
  return { items, quiet, emailEnabled: s?.notifyEmail ?? true }
}

async function writeBrief(agentRunId: number, scan: Scan) {
  'use step'
  const { generateText, Output } = await import('ai')
  const { z } = await import('zod')
  const { appendLog } = await import('@/lib/agents/runlog')

  const list = scan.items
    .map((i) => `- [${i.state}] ${i.title} (${i.priority})${i.dueAt ? ` due ${i.dueAt}` : ''}`)
    .join('\n')

  const { output } = await generateText({
    model: 'anthropic/claude-haiku-4.5',
    output: Output.object({
      schema: z.object({
        subject: z.string().max(80),
        markdown: z.string().describe('3-6 lines max. Lead with the single most important item.'),
      }),
    }),
    system:
      'You write terse priority briefs for one person. No greetings, no sign-off. Order by urgency: overdue first. Use bullets. Suggest one concrete next step at the end.',
    prompt: `Now: ${new Date().toISOString()}\n\nFlagged tasks:\n${list}`,
  })
  await appendLog(agentRunId, `Brief: ${output.subject}`)
  return output
}

async function send(agentRunId: number, userId: string, brief: { subject: string; markdown: string }, quiet: boolean) {
  'use step'
  const { db } = await import('@/lib/db')
  const { settings } = await import('@/lib/db/schema')
  const { eq } = await import('drizzle-orm')
  const { sendOwnerEmail, markdownToEmailHtml, wrapEmailHtml } = await import('@/lib/email')
  const { pushNotification, appendLog } = await import('@/lib/agents/runlog')

  const [s] = await db.select().from(settings).where(eq(settings.userId, userId))
  let emailed = false
  if ((s?.notifyEmail ?? true) && !quiet) {
    const res = await sendOwnerEmail({
      subject: brief.subject,
      html: wrapEmailHtml(brief.subject, markdownToEmailHtml(brief.markdown), 'Priority brief from dross. Quiet hours and email delivery are in Settings.'),
      idempotencyKey: `priority-brief/${userId}/${new Date().toISOString().slice(0, 13)}`,
    })
    emailed = !!res.id
    await appendLog(agentRunId, emailed ? `Emailed (${res.id})` : `Email skipped: ${'error' in res ? res.error : res.skipped}`, emailed ? 'info' : 'warn')
  } else if (quiet) {
    await appendLog(agentRunId, 'Quiet hours: in-app only')
  }
  await pushNotification({ userId, kind: 'due_soon', title: brief.subject, body: brief.markdown, href: '/tasks', emailed })
  return emailed
}

async function complete(agentRunId: number, summary: string, sent: boolean) {
  'use step'
  const { setRunStatus } = await import('@/lib/agents/runlog')
  await setRunStatus(agentRunId, 'completed', { summary: sent ? `${summary} · emailed` : summary })
}

async function fail(agentRunId: number, message: string) {
  'use step'
  const { setRunStatus, appendLog } = await import('@/lib/agents/runlog')
  await appendLog(agentRunId, message, 'error')
  await setRunStatus(agentRunId, 'failed', { error: message })
}
