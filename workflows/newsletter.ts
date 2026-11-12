type Input = { userId: string; agentRunId: number }

export async function newsletterWorkflow(input: Input) {
  'use workflow'

  await begin(input.agentRunId)
  try {
    const context = await gatherContext(input.agentRunId, input.userId)
    const external = await scanInterests(input.agentRunId, context.interests)
    const issue = await compose(input.agentRunId, input.userId, context, external)
    await deliver(input.agentRunId, input.userId, issue.id, issue.title, issue.html)
    return { newsletterId: issue.id }
  } catch (err) {
    await fail(input.agentRunId, err instanceof Error ? err.message : String(err))
    throw err
  }
}

async function begin(agentRunId: number) {
  'use step'
  const { setRunStatus, appendLog } = await import('@/lib/agents/runlog')
  await setRunStatus(agentRunId, 'running')
  await appendLog(agentRunId, 'Gathering interests and hub activity')
}

type Context = {
  interests: { topic: string; keywords: string[]; weight: number }[]
  openTasks: { title: string; dueAt: string | null; priority: string }[]
  recentPages: { title: string; slug: string; summary: string | null }[]
  completedCount: number
}

async function gatherContext(agentRunId: number, userId: string): Promise<Context> {
  'use step'
  const { db } = await import('@/lib/db')
  const { interests, tasks, wikiPages } = await import('@/lib/db/schema')
  const { and, desc, eq, gte, isNull, ne } = await import('drizzle-orm')
  const { appendLog } = await import('@/lib/agents/runlog')

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const [ints, open, done, pages] = await Promise.all([
    db.select().from(interests).where(eq(interests.userId, userId)).orderBy(desc(interests.weight)),
    db
      .select({ title: tasks.title, dueAt: tasks.dueAt, priority: tasks.priority })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          isNull(tasks.archivedAt),
          ne(tasks.status, 'done'),
          ne(tasks.status, 'skipped'),
        ),
      )
      .limit(15),
    db
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), eq(tasks.status, 'done'), gte(tasks.updatedAt, weekAgo))),
    db
      .select({ title: wikiPages.title, slug: wikiPages.slug, summary: wikiPages.summary })
      .from(wikiPages)
      .where(and(eq(wikiPages.userId, userId), isNull(wikiPages.archivedAt), gte(wikiPages.updatedAt, weekAgo)))
      .limit(10),
  ])
  await appendLog(agentRunId, `${ints.length} interests · ${open.length} open tasks · ${pages.length} pages touched this week`)
  return {
    interests: ints.map((i) => ({ topic: i.topic, keywords: i.keywords, weight: i.weight })),
    openTasks: open.map((t) => ({ ...t, dueAt: t.dueAt?.toISOString() ?? null })),
    recentPages: pages,
    completedCount: done.length,
  }
}

async function scanInterests(agentRunId: number, ints: Context['interests']) {
  'use step'
  const { generateText } = await import('ai')
  const { appendLog } = await import('@/lib/agents/runlog')

  if (ints.length === 0) {
    await appendLog(agentRunId, 'No interests configured; skipping web scan', 'warn')
    return [] as { topic: string; brief: string; sources: { title: string; url: string }[] }[]
  }

  const results = []
  for (const i of ints.slice(0, 6)) {
    const result = await generateText({
      model: 'perplexity/sonar-pro',
      system:
        'You are a sharp newsletter researcher. Report only genuinely new developments from the past 7-10 days. Be specific: names, numbers, dates. If nothing notable happened, say exactly "Nothing notable this week." Cite sources as [n].',
      prompt: `Topic: ${i.topic}${i.keywords.length ? `\nKeywords: ${i.keywords.join(', ')}` : ''}\n\nWhat happened recently that someone tracking this should know?`,
    })
    const sources = (result.sources ?? [])
      .filter((s): s is Extract<typeof s, { sourceType: 'url' }> => s.sourceType === 'url')
      .map((s) => ({ title: s.title ?? new URL(s.url).hostname, url: s.url }))
      .slice(0, 6)
    results.push({ topic: i.topic, brief: result.text, sources })
    await appendLog(agentRunId, `Scanned "${i.topic}" (${sources.length} sources)`)
  }
  return results
}

async function compose(
  agentRunId: number,
  userId: string,
  ctx: Context,
  external: Awaited<ReturnType<typeof scanInterests>>,
) {
  'use step'
  const { generateText, Output } = await import('ai')
  const { z } = await import('zod')
  const { db } = await import('@/lib/db')
  const { newsletters } = await import('@/lib/db/schema')
  const { appendLog } = await import('@/lib/agents/runlog')
  const { markdownToEmailHtml, wrapEmailHtml } = await import('@/lib/email')

  const externalNotes = external
    .map((e) => {
      const src = e.sources.map((s, i) => `  [${i + 1}] ${s.title} — ${s.url}`).join('\n')
      return `### ${e.topic}\n${e.brief}\nSources:\n${src}`
    })
    .join('\n\n')

  const hubNotes = [
    `Completed this week: ${ctx.completedCount} tasks`,
    `Open tasks (${ctx.openTasks.length}):`,
    ...ctx.openTasks.map((t) => `- ${t.title} [${t.priority}]${t.dueAt ? ` due ${t.dueAt.slice(0, 10)}` : ''}`),
    `Wiki pages touched this week:`,
    ...ctx.recentPages.map((p) => `- ${p.title}${p.summary ? ` — ${p.summary}` : ''}`),
  ].join('\n')

  const { output } = await generateText({
    model: 'anthropic/claude-sonnet-4.6',
    output: Output.object({
      schema: z.object({
        title: z.string().describe('Issue title, e.g. "Week of Sep 7 — three things worth your attention"'),
        markdown: z.string().describe('Full newsletter body in markdown'),
      }),
    }),
    system: `You write a weekly personal briefing for one reader: the owner of this hub. Voice: a trusted chief of staff — direct, warm, no filler, no hype. Structure:
## This week in your world  (2-4 bullets from hub data: what got done, what's looming)
## Worth knowing  (one short section per interest with real news; skip topics with nothing notable; use markdown links [title](url) for sources — only URLs provided)
## One suggestion  (a single concrete, small action tied to their tasks or interests)
Keep it under 500 words. Never invent facts or links.`,
    prompt: `HUB DATA:\n${hubNotes}\n\nEXTERNAL SCAN:\n${externalNotes || '(no interests configured)'}`,
  })

  const html = wrapEmailHtml(output.title, markdownToEmailHtml(output.markdown), 'Your weekly dross briefing. Adjust interests and schedule in Settings.')
  const [row] = await db
    .insert(newsletters)
    .values({ userId, title: output.title, contentMd: output.markdown, contentHtml: html })
    .returning({ id: newsletters.id })
  await appendLog(agentRunId, `Composed "${output.title}"`)
  return { id: row.id, title: output.title, html }
}

async function deliver(agentRunId: number, userId: string, newsletterId: number, title: string, html: string) {
  'use step'
  const { db } = await import('@/lib/db')
  const { newsletters, settings } = await import('@/lib/db/schema')
  const { eq } = await import('drizzle-orm')
  const { sendOwnerEmail } = await import('@/lib/email')
  const { appendLog, setRunStatus, pushNotification } = await import('@/lib/agents/runlog')

  const [s] = await db.select().from(settings).where(eq(settings.userId, userId))
  let emailed = false
  if (s?.notifyEmail ?? true) {
    const res = await sendOwnerEmail({ subject: title, html, idempotencyKey: `newsletter/${newsletterId}` })
    if (res.id) {
      emailed = true
      await db.update(newsletters).set({ sentAt: new Date(), emailId: res.id }).where(eq(newsletters.id, newsletterId))
      await appendLog(agentRunId, `Emailed (${res.id})`)
    } else {
      await appendLog(agentRunId, `Email skipped: ${'error' in res ? res.error : res.skipped}`, 'warn')
    }
  }
  await pushNotification({
    userId,
    kind: 'newsletter',
    title: `New briefing: ${title}`,
    href: `/newsletter/${newsletterId}`,
    emailed,
  })
  await setRunStatus(agentRunId, 'completed', { summary: emailed ? 'Sent by email' : 'Saved to archive' })
}

async function fail(agentRunId: number, message: string) {
  'use step'
  const { setRunStatus, appendLog } = await import('@/lib/agents/runlog')
  await appendLog(agentRunId, message, 'error')
  await setRunStatus(agentRunId, 'failed', { error: message })
}
