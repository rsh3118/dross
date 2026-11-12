'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { WikiPage } from '@/lib/db/schema'
import { createPageAction, updatePageAction } from '@/app/actions/wiki'
import { Markdown } from '@/components/markdown'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

export function WikiEditor({ mode, page }: { mode: 'create' | 'edit'; page?: WikiPage }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [title, setTitle] = useState(page?.title ?? '')
  const [summary, setSummary] = useState(page?.summary ?? '')
  const [tags, setTags] = useState(page?.tags.join(', ') ?? '')
  const [content, setContent] = useState(page?.content ?? '')

  const parsedTags = tags
    .split(',')
    .map((t) => t.trim().replace(/^#/, '').toLowerCase())
    .filter(Boolean)

  const save = (status?: 'draft' | 'published') =>
    startTransition(async () => {
      try {
        if (mode === 'create') {
          await createPageAction({ title, content, summary: summary || null, tags: parsedTags, status: status ?? 'published' })
        } else if (page) {
          const slug = await updatePageAction(page.id, {
            title,
            content,
            summary: summary || null,
            tags: parsedTags,
            ...(status && { status }),
          })
          toast('Saved')
          router.push(`/wiki/${slug}`)
        }
      } catch (e) {
        console.error(e)
        toast.error('Could not save page')
      }
    })

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-widest text-primary">
          {mode === 'create' ? 'new page' : `editing ${page?.slug}`}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" nativeButton={false} render={<Link href={page ? `/wiki/${page.slug}` : '/wiki'} />}>
            Cancel
          </Button>
          {(mode === 'create' || page?.status === 'draft') && (
            <Button variant="outline" size="sm" disabled={pending || !title.trim()} onClick={() => save('draft')}>
              Save draft
            </Button>
          )}
          <Button size="sm" disabled={pending || !title.trim()} onClick={() => save('published')}>
            {page?.status === 'draft' ? 'Publish' : 'Save'}
          </Button>
        </div>
      </div>

      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Page title"
        className="h-12 text-2xl font-semibold tracking-tight border-0 border-b rounded-none px-0 bg-transparent focus-visible:ring-0 shadow-none"
        aria-label="Title"
      />

      <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
        <div className="flex flex-col gap-2">
          <Label htmlFor="w-summary">Summary</Label>
          <Input id="w-summary" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="One line on what this page is" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="w-tags">Tags</Label>
          <Input id="w-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="health, finance" />
        </div>
      </div>

      <Tabs defaultValue="write">
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="write">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={24}
            spellCheck
            placeholder={'Markdown. Link other pages with [[Page title]].'}
            className="font-mono text-sm leading-relaxed min-h-96 resize-y"
            aria-label="Content"
          />
        </TabsContent>
        <TabsContent value="preview">
          <div className="rounded-md border bg-card p-6 min-h-96">
            {content.trim() ? <Markdown content={content} /> : <p className="text-sm text-muted-foreground italic">Nothing to preview.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
