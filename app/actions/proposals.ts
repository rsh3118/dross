'use server'

import { and, desc, eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { proposals, tasks, wikiPages } from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import { createWikiPage, updateWikiPage } from '@/lib/wiki'

export async function listProposals() {
  const userId = await getUserId()
  return db
    .select()
    .from(proposals)
    .where(eq(proposals.userId, userId))
    .orderBy(desc(proposals.createdAt))
    .limit(100)
}

async function markResolved(id: number, userId: string, status: 'approved' | 'rejected') {
  await db
    .update(proposals)
    .set({ status, resolvedAt: new Date() })
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId)))
}

export async function rejectProposal(id: number) {
  const userId = await getUserId()
  const [p] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId), eq(proposals.status, 'pending')))
  if (p?.kind === 'code_change') {
    const { getOctokit, REPO } = await import('@/lib/github')
    const gh = await getOctokit()
    const pull_number = Number((p.payload as { prNumber?: number }).prNumber)
    const { data: pr } = await gh.rest.pulls.get({ ...REPO, pull_number })
    if (pr.state === 'open') await gh.rest.pulls.update({ ...REPO, pull_number, state: 'closed' })
  }
  await markResolved(id, userId, 'rejected')
  revalidatePath('/proposals')
  revalidatePath('/')
}

export async function approveProposal(id: number) {
  const userId = await getUserId()
  const [p] = await db
    .select()
    .from(proposals)
    .where(and(eq(proposals.id, id), eq(proposals.userId, userId), eq(proposals.status, 'pending')))
  if (!p) throw new Error('Proposal not found or already resolved')

  const payload = p.payload as Record<string, unknown>

  switch (p.kind) {
    case 'archive_task': {
      await db
        .update(tasks)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(tasks.id, Number(payload.taskId)), eq(tasks.userId, userId)))
      break
    }
    case 'retag': {
      await updateWikiPage({
        userId,
        id: Number(payload.pageId),
        tags: (payload.tags as string[]) ?? [],
        authoredBy: 'housekeeping-agent',
      })
      break
    }
    case 'fix_link': {
      const slug = String(payload.missingSlug)
      const title = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      const [existing] = await db
        .select({ id: wikiPages.id })
        .from(wikiPages)
        .where(and(eq(wikiPages.userId, userId), eq(wikiPages.slug, slug)))
      if (!existing) {
        await createWikiPage({
          userId,
          title,
          content: `_Stub created by housekeeping to resolve a link from [[${String(payload.fromSlug)}]]._`,
          tags: ['stub'],
          status: 'draft',
          authoredBy: 'housekeeping-agent',
        })
      }
      break
    }
    case 'merge_pages': {
      const keepId = Number(payload.keepId)
      const mergeId = Number(payload.mergeId)
      const [keep] = await db
        .select()
        .from(wikiPages)
        .where(and(eq(wikiPages.id, keepId), eq(wikiPages.userId, userId)))
      const [merge] = await db
        .select()
        .from(wikiPages)
        .where(and(eq(wikiPages.id, mergeId), eq(wikiPages.userId, userId)))
      if (!keep || !merge) throw new Error('One of the pages no longer exists')

      const mergedSources = [...keep.sources, ...merge.sources.filter((s) => !keep.sources.some((k) => k.url === s.url))]
      await updateWikiPage({
        userId,
        id: keep.id,
        content: `${keep.content.trimEnd()}\n\n## Merged from "${merge.title}"\n\n${merge.content.trim()}`,
        tags: [...new Set([...keep.tags, ...merge.tags])],
        sources: mergedSources,
        authoredBy: 'housekeeping-agent',
      })
      await db
        .update(wikiPages)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(wikiPages.id, merge.id), eq(wikiPages.userId, userId)))
      break
    }
    case 'code_change': {
      const { getOctokit, REPO } = await import('@/lib/github')
      const gh = await getOctokit()
      const pull_number = Number(payload.prNumber)
      const { data: pr } = await gh.rest.pulls.get({ ...REPO, pull_number })
      if (pr.merged) break
      if (pr.state !== 'open') throw new Error(`PR #${pull_number} is already closed on GitHub`)
      await gh.rest.pulls.merge({ ...REPO, pull_number, merge_method: 'squash' })
      break
    }
  }

  await markResolved(id, userId, 'approved')
  revalidatePath('/proposals')
  revalidatePath('/wiki')
  revalidatePath('/tasks')
  revalidatePath('/')
}
