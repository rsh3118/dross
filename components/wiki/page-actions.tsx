'use client'

import { useTransition } from 'react'
import { Archive, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { archivePage, publishPage } from '@/app/actions/wiki'
import { Button } from '@/components/ui/button'

export function PageActions({ pageId, status }: { pageId: number; status: string }) {
  const [pending, startTransition] = useTransition()
  return (
    <div className="flex flex-col gap-2">
      {status === 'draft' && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await publishPage(pageId)
              toast('Published')
            })
          }
        >
          <CheckCircle2 className="size-4" /> Publish draft
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="justify-start text-muted-foreground"
        disabled={pending}
        onClick={() => {
          if (confirm('Archive this page? It will disappear from the wiki but stay in the database.')) {
            startTransition(() => archivePage(pageId))
          }
        }}
      >
        <Archive className="size-4" /> Archive
      </Button>
    </div>
  )
}
