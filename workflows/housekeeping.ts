type Input = { userId: string; agentRunId: number }

export async function housekeepingWorkflow(input: Input) {
  'use workflow'

  await begin(input.agentRunId)
  try {
    const snapshot = await loadSnapshot(input.userId)
    const mechanical = await mechanicalChecks(input.agentRunId, input.userId, snapshot)
    const semantic = await semanticChecks(input.agentRunId, input.userId, snapshot)
    await complete(input.agentRunId, input.userId, mechanical + semantic)
    return { proposals: mechanical + semantic }
  } catch (err) {
    await fail(input.agentRunId, err instanceof Error ? err.message : String(err))
    throw err
  }
}

async function begin(agentRunId: number) {
  'use step'
  const { setRunStatus, appendLog } = await import('@/lib/agents/runlog')
  await setRunStatus(agentRunId, 'running')
  await appendLog(agentRunId, 'Scanning wiki and tasks')
}

type Snapshot = {
  pages: { id: number; slug: string; title: string; summary: string | null; tags: string[]; content: string }[]
  links: { fromPageId: number; toSlug: string }[]
  staleTasks: { id: number; title: string; status: string; updatedAt: string; dueAt: string | null }[]
  openProposalKeys: string[]
}

async function loadSnapshot(userId: string): Promise<Snapshot> {
  'use step'
  const { db } = await import('@/lib/db')
  const { wikiPages, wikiLinks, tasks, proposals } = await import('@/lib/db/schema')
  const { and, eq, isNull, lt, ne } = await import('drizzle-orm')

  const staleBefore = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
  const [pages, links, staleTasks, pending] = await Promise.all([
    db
      .select({
        id: wikiPages.id,
        slug: wikiPages.slug,
        title: wikiPages.title,
        summary: wikiPages.summary,
        tags: wikiPages.tags,
        content: wikiPages.content,
      })
      .from(wikiPages)
      .where(and(eq(wikiPages.userId, userId), isNull(wikiPages.archivedAt))),
    db
      .select({ fromPageId: wikiLinks.fromPageId, toSlug: wikiLinks.toSlug })
      .from(wikiLinks)
      .where(eq(wikiLinks.userId, userId)),
    db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status, updatedAt: tasks.updatedAt, dueAt: tasks.dueAt })
      .from(tasks)
      .where(and(eq(tasks.userId, userId), isNull(tasks.archivedAt), ne(tasks.status, 'done'), ne(tasks.status, 'skipped'), lt(tasks.updatedAt, staleBefore))),
    db
      .select({ kind: proposals.kind, payload: proposals.payload })
      .from(proposals)
      .where(and(eq(proposals.userId, userId), eq(proposals.status, 'pending'))),
  ])

  return {
    pages: pages.map((p) => ({ ...p, content: p.content.slice(0, 1500) })),
    links,
    staleTasks: staleTasks.map((t) => ({
      ...t,
      updatedAt: t.updatedAt.toISOString(),
      dueAt: t.dueAt?.toISOString() ?? null,
    })),
    openProposalKeys: pending.map((p) => `${p.kind}:${JSON.stringify(p.payload)}`),
  }
}

async function mechanicalChecks(agentRunId: number, userId: string, snap: Snapshot) {
  'use step'
  const { db } = await import('@/lib/db')
  const { proposals } = await import('@/lib/db/schema')
  const { appendLog } = await import('@/lib/agents/runlog')

  const slugs = new Set(snap.pages.map((p) => p.slug))
  const byId = new Map(snap.pages.map((p) => [p.id, p]))
  const rows: (typeof proposals.$inferInsert)[] = []

  for (const l of snap.links) {
    if (slugs.has(l.toSlug)) continue
    const from = byId.get(l.fromPageId)
    if (!from) continue
    const payload = { fromPageId: l.fromPageId, fromSlug: from.slug, missingSlug: l.toSlug }
    if (snap.openProposalKeys.includes(`fix_link:${JSON.stringify(payload)}`)) continue
    rows.push({
      userId,
      agent: 'housekeeping',
      kind: 'fix_link',
      title: `Broken link in "${from.title}" → [[${l.toSlug}]]`,
      rationale: `The page links to "${l.toSlug}" but no page with that slug exists. Approving creates an empty stub page so the link resolves.`,
      payload,
    })
  }

  for (const t of snap.staleTasks) {
    const payload = { taskId: t.id }
    if (snap.openProposalKeys.includes(`archive_task:${JSON.stringify(payload)}`)) continue
    rows.push({
      userId,
      agent: 'housekeeping',
      kind: 'archive_task',
      title: `Archive stale task "${t.title}"`,
      rationale: `Untouched since ${t.updatedAt.slice(0, 10)} and still ${t.status}. Approving archives it (recoverable).`,
      payload,
    })
  }

  if (rows.length) await db.insert(proposals).values(rows)
  await appendLog(agentRunId, `Mechanical checks: ${rows.length} proposals (broken links, stale tasks)`)
  return rows.length
}

async function semanticChecks(agentRunId: number, userId: string, snap: Snapshot) {
  'use step'
  const { generateText, Output } = await import('ai')
  const { z } = await import('zod')
  const { db } = await import('@/lib/db')
  const { proposals } = await import('@/lib/db/schema')
  const { appendLog } = await import('@/lib/agents/runlog')

  if (snap.pages.length < 2) {
    await appendLog(agentRunId, 'Semantic checks skipped: fewer than 2 pages')
    return 0
  }

  const catalog = snap.pages
    .map((p) => `#${p.id} [${p.slug}] "${p.title}" tags=${p.tags.join(',') || '-'}\n  ${p.summary ?? p.content.slice(0, 200).replace(/\s+/g, ' ')}`)
    .join('\n')

  const { output } = await generateText({
    model: 'anthropic/claude-sonnet-4.6',
    output: Output.object({
      schema: z.object({
        merges: z
          .array(
            z.object({
              keepId: z.number(),
              mergeId: z.number(),
              reason: z.string(),
            }),
          )
          .max(5),
        retags: z
          .array(
            z.object({
              pageId: z.number(),
              tags: z.array(z.string()).min(1).max(5),
              reason: z.string(),
            }),
          )
          .max(8),
      }),
    }),
    system:
      'You are a careful librarian for a personal wiki. Only propose a merge when two pages clearly cover the same subject. Only propose retags for pages with zero tags or obviously wrong tags; use lowercase single words, reusing existing tags where possible. Be conservative — an empty list is a fine answer.',
    prompt: `Page catalog:\n${catalog}`,
  })

  const rows: (typeof proposals.$inferInsert)[] = []
  const byId = new Map(snap.pages.map((p) => [p.id, p]))

  for (const m of output.merges) {
    const keep = byId.get(m.keepId)
    const merge = byId.get(m.mergeId)
    if (!keep || !merge || keep.id === merge.id) continue
    const payload = { keepId: keep.id, mergeId: merge.id }
    if (snap.openProposalKeys.includes(`merge_pages:${JSON.stringify(payload)}`)) continue
    rows.push({
      userId,
      agent: 'housekeeping',
      kind: 'merge_pages',
      title: `Merge "${merge.title}" into "${keep.title}"`,
      rationale: `${m.reason} Approving appends the merged page's content under a heading in the kept page and archives the duplicate.`,
      payload,
    })
  }
  for (const r of output.retags) {
    const page = byId.get(r.pageId)
    if (!page) continue
    const tags = [...new Set(r.tags.map((t) => t.toLowerCase().trim()).filter(Boolean))]
    const payload = { pageId: page.id, tags }
    if (snap.openProposalKeys.includes(`retag:${JSON.stringify(payload)}`)) continue
    rows.push({
      userId,
      agent: 'housekeeping',
      kind: 'retag',
      title: `Tag "${page.title}" as ${tags.map((t) => `#${t}`).join(' ')}`,
      rationale: r.reason,
      payload,
    })
  }

  if (rows.length) await db.insert(proposals).values(rows)
  await appendLog(agentRunId, `Semantic checks: ${rows.length} proposals (merges, retags)`)
  return rows.length
}

async function complete(agentRunId: number, userId: string, total: number) {
  'use step'
  const { setRunStatus, pushNotification } = await import('@/lib/agents/runlog')
  await setRunStatus(agentRunId, 'completed', {
    summary: total === 0 ? 'Nothing to tidy' : `${total} proposal${total === 1 ? '' : 's'} queued`,
  })
  if (total > 0) {
    await pushNotification({
      userId,
      kind: 'proposal',
      title: `Housekeeping found ${total} thing${total === 1 ? '' : 's'} to review`,
      href: '/proposals',
    })
  }
}

async function fail(agentRunId: number, message: string) {
  'use step'
  const { setRunStatus, appendLog } = await import('@/lib/agents/runlog')
  await appendLog(agentRunId, message, 'error')
  await setRunStatus(agentRunId, 'failed', { error: message })
}
