'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

type Purchase = {
  id: string
  receivedAt: string
  subject: string | null
  invoiceId: string | null
  items: { name: string; amount: number | null }[]
  totalAmount: string | null
  currency: string | null
}

export function AmazonImportTable({ initialRows }: { initialRows: Purchase[] }) {
  const [rows, setRows] = useState(initialRows)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ id: string; status: string; scanned: number; imported: number; lastError: string | null } | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(initialRows.length)
  const pageSize = 25

  async function loadPage(nextPage: number) {
    const response = await fetch(`/api/gmail/amazon-import?page=${nextPage}&pageSize=${pageSize}`, { cache: 'no-store' })
    if (!response.ok) return
    const result = await response.json()
    setRows(result.rows)
    setTotal(result.total)
    setPage(nextPage)
  }

  async function importPurchases() {
    setBusy(true)
    setStatus('Started a background import of all 2025 Amazon emails…')
    try {
      const response = await fetch('/api/gmail/amazon-import', { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setStatus(`Import is running in the background (run ${result.runId}). You can leave this page open.`)
      // Refresh the table while the durable workflow processes Gmail pages.
      const refresh = async () => {
        const latest = await fetch('/api/gmail/amazon-import', { cache: 'no-store' })
        if (latest.ok) {
          const result = await latest.json()
          setRows(result.rows)
          setTotal(result.total)
        }
        const progressResponse = await fetch('/api/gmail/amazon-import?progress=true', { cache: 'no-store' })
        if (progressResponse.ok) {
          const nextProgress = await progressResponse.json()
          setProgress(nextProgress)
          if (nextProgress?.status === 'failed') setStatus(`Import failed: ${nextProgress.lastError ?? 'Unknown error'}`)
          if (nextProgress?.status === 'completed') setStatus(`Import completed: scanned ${nextProgress.scanned} emails and imported ${nextProgress.imported} new records.`)
        }
      }
      await refresh()
      setBusy(false)
      let checks = 0
      const timer = window.setInterval(async () => {
        checks += 1
        await refresh()
        if (checks >= 120) window.clearInterval(timer)
      }, 5000)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not start import.')
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Amazon purchases from 2025</h2>
          <p className="text-sm text-muted-foreground">Raw email content is stored privately with each imported record.</p>
        </div>
        <Button onClick={importPurchases} disabled={busy}>
          {busy ? 'Importing…' : 'Import 2025 purchases'}
        </Button>
      </div>
      {status && <p className="text-sm text-muted-foreground" role="status">{status}</p>}
      {progress && <div className="grid gap-2 rounded-lg border bg-muted/20 p-4 text-sm sm:grid-cols-3"><div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize">{progress.status}</p></div><div><span className="text-muted-foreground">Emails scanned</span><p className="font-medium">{progress.scanned}</p></div><div><span className="text-muted-foreground">Records imported</span><p className="font-medium">{progress.imported}</p></div><div className="sm:col-span-3"><span className="text-muted-foreground">Job ID</span><p className="font-mono text-xs">{progress.id}</p></div>{progress.lastError && <div className="sm:col-span-3 space-y-1"><p className="font-medium text-destructive">Last error</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-destructive/10 p-2 text-xs text-destructive">{progress.lastError}</pre></div>}</div>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No purchases imported yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="p-3">Date</th><th className="p-3">Items</th><th className="p-3">Amount</th><th className="p-3">Invoice ID</th><th className="p-3">Email</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t align-top">
                  <td className="p-3 whitespace-nowrap">{new Date(row.receivedAt).toLocaleDateString()}</td>
                  <td className="p-3">{row.items.length ? row.items.map((item) => item.name).join(', ') : row.subject ?? '—'}</td>
                  <td className="p-3 whitespace-nowrap">{row.totalAmount ? `${row.currency ?? 'USD'} ${row.totalAmount}` : '—'}</td>
                  <td className="p-3 font-mono text-xs">{row.invoiceId ?? '—'}</td>
                  <td className="p-3">{row.subject ?? 'Amazon email'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > pageSize && <div className="flex items-center justify-between gap-4 border-t pt-4 text-sm"><span className="text-muted-foreground">Page {page} of {Math.ceil(total / pageSize)} · {total} emails</span><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => loadPage(page - 1)} disabled={page === 1}>Previous</Button><Button variant="outline" size="sm" onClick={() => loadPage(page + 1)} disabled={page >= Math.ceil(total / pageSize)}>Next</Button></div></div>}
    </section>
  )
}
