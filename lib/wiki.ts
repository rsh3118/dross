import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  wikiLinks,
  wikiPages,
  wikiRevisions,
  type AuthoredBy,
  type WikiSource,
  type WikiStatus,
} from '@/lib/db/schema'
import { extractWikiLinks, slugify } from '@/lib/wiki-text'

export { extractWikiLinks, renderWikiLinks, slugify } from '@/lib/wiki-text'

async function ensureUniqueSlug(userId: string, base: string, excludeId?: number) {
  let slug = base
  for (let i = 2; i < 50; i++) {
    const [existing] = await db
      .select({ id: wikiPages.id })
      .from(wikiPages)
      .where(and(eq(wikiPages.userId, userId), eq(wikiPages.slug, slug)))
    if (!existing || existing.id === excludeId) return slug
    slug = `${base}-${i}`
  }
  return `${base}-${Date.now()}`
}

async function syncLinks(userId: string, pageId: number, content: string) {
  await db.delete(wikiLinks).where(eq(wikiLinks.fromPageId, pageId))
  const targets = extractWikiLinks(content)
  if (targets.length) {
    await db
      .insert(wikiLinks)
      .values(targets.map((toSlug) => ({ userId, fromPageId: pageId, toSlug })))
      .onConflictDoNothing()
  }
}

export async function createWikiPage(opts: {
  userId: string
  title: string
  content: string
  summary?: string | null
  tags?: string[]
  sources?: WikiSource[]
  status?: WikiStatus
  authoredBy?: AuthoredBy
}) {
  const slug = await ensureUniqueSlug(opts.userId, slugify(opts.title))
  const [page] = await db
    .insert(wikiPages)
    .values({
      userId: opts.userId,
      slug,
      title: opts.title,
      content: opts.content,
      summary: opts.summary ?? null,
      tags: opts.tags ?? [],
      sources: opts.sources ?? [],
      status: opts.status ?? 'published',
      authoredBy: opts.authoredBy ?? 'user',
    })
    .returning()
  await db.insert(wikiRevisions).values({
    userId: opts.userId,
    pageId: page.id,
    title: page.title,
    content: page.content,
    authoredBy: page.authoredBy,
  })
  await syncLinks(opts.userId, page.id, page.content)
  return page
}

export async function updateWikiPage(opts: {
  userId: string
  id: number
  title?: string
  content?: string
  summary?: string | null
  tags?: string[]
  sources?: WikiSource[]
  status?: WikiStatus
  authoredBy?: AuthoredBy
}) {
  const [current] = await db
    .select()
    .from(wikiPages)
    .where(and(eq(wikiPages.id, opts.id), eq(wikiPages.userId, opts.userId)))
  if (!current) throw new Error('Page not found')

  const title = opts.title ?? current.title
  const content = opts.content ?? current.content
  const slug =
    title !== current.title ? await ensureUniqueSlug(opts.userId, slugify(title), current.id) : current.slug

  const [page] = await db
    .update(wikiPages)
    .set({
      title,
      slug,
      content,
      summary: opts.summary === undefined ? current.summary : opts.summary,
      tags: opts.tags ?? current.tags,
      sources: opts.sources ?? current.sources,
      status: opts.status ?? current.status,
      updatedAt: new Date(),
    })
    .where(and(eq(wikiPages.id, opts.id), eq(wikiPages.userId, opts.userId)))
    .returning()

  if (title !== current.title || content !== current.content) {
    await db.insert(wikiRevisions).values({
      userId: opts.userId,
      pageId: page.id,
      title,
      content,
      authoredBy: opts.authoredBy ?? 'user',
    })
    await syncLinks(opts.userId, page.id, content)
  }
  return page
}
