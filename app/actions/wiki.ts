'use server'

import { and, desc, eq, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { wikiLinks, wikiPages, wikiRevisions, type WikiStatus } from '@/lib/db/schema'
import { getUserId } from '@/lib/session'
import { createWikiPage, updateWikiPage } from '@/lib/wiki'

const pageInput = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().max(200_000),
  summary: z.string().trim().max(500).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
  status: z.enum(['draft', 'published']).optional(),
})

export async function listWikiPages() {
  const userId = await getUserId()
  return db
    .select({
      id: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
      summary: wikiPages.summary,
      status: wikiPages.status,
      tags: wikiPages.tags,
      authoredBy: wikiPages.authoredBy,
      updatedAt: wikiPages.updatedAt,
    })
    .from(wikiPages)
    .where(and(eq(wikiPages.userId, userId), isNull(wikiPages.archivedAt)))
    .orderBy(desc(wikiPages.updatedAt))
}

export async function getWikiPage(slug: string) {
  const userId = await getUserId()
  const [page] = await db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.userId, userId), eq(wikiPages.slug, slug)))
  if (!page) return null

  const [backlinks, revisions] = await Promise.all([
    db
      .select({ id: wikiPages.id, slug: wikiPages.slug, title: wikiPages.title })
      .from(wikiLinks)
      .innerJoin(wikiPages, eq(wikiLinks.fromPageId, wikiPages.id))
      .where(and(eq(wikiLinks.userId, userId), eq(wikiLinks.toSlug, page.slug))),
    db
      .select({
        id: wikiRevisions.id,
        title: wikiRevisions.title,
        authoredBy: wikiRevisions.authoredBy,
        createdAt: wikiRevisions.createdAt,
      })
      .from(wikiRevisions)
      .where(and(eq(wikiRevisions.pageId, page.id), eq(wikiRevisions.userId, userId)))
      .orderBy(desc(wikiRevisions.createdAt))
      .limit(20),
  ])
  return { page, backlinks, revisions }
}

export async function getRevision(id: number) {
  const userId = await getUserId()
  const [rev] = await db
    .select()
    .from(wikiRevisions)
    .where(and(eq(wikiRevisions.id, id), eq(wikiRevisions.userId, userId)))
  return rev ?? null
}

export async function createPageAction(raw: z.infer<typeof pageInput>) {
  const userId = await getUserId()
  const data = pageInput.parse(raw)
  const page = await createWikiPage({ userId, ...data, summary: data.summary ?? null })
  revalidatePath('/wiki')
  revalidatePath('/')
  redirect(`/wiki/${page.slug}`)
}

export async function updatePageAction(id: number, raw: Partial<z.infer<typeof pageInput>>) {
  const userId = await getUserId()
  const data = pageInput.partial().parse(raw)
  const page = await updateWikiPage({ userId, id, ...data, status: data.status as WikiStatus | undefined })
  revalidatePath('/wiki')
  revalidatePath(`/wiki/${page.slug}`)
  revalidatePath('/')
  return page.slug
}

export async function publishPage(id: number) {
  const userId = await getUserId()
  const [page] = await db
    .update(wikiPages)
    .set({ status: 'published', updatedAt: new Date() })
    .where(and(eq(wikiPages.id, id), eq(wikiPages.userId, userId)))
    .returning({ slug: wikiPages.slug })
  revalidatePath('/wiki')
  revalidatePath(`/wiki/${page.slug}`)
}

export async function archivePage(id: number) {
  const userId = await getUserId()
  await db
    .update(wikiPages)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(wikiPages.id, id), eq(wikiPages.userId, userId)))
  revalidatePath('/wiki')
  redirect('/wiki')
}

export async function restoreRevision(pageId: number, revisionId: number) {
  const userId = await getUserId()
  const [rev] = await db
    .select()
    .from(wikiRevisions)
    .where(and(eq(wikiRevisions.id, revisionId), eq(wikiRevisions.userId, userId), eq(wikiRevisions.pageId, pageId)))
  if (!rev) throw new Error('Revision not found')
  const page = await updateWikiPage({ userId, id: pageId, title: rev.title, content: rev.content })
  revalidatePath(`/wiki/${page.slug}`)
  return page.slug
}
