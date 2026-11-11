import { Icon } from '@/components/icons'
import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Button, cx, Empty, Input, Spinner } from '@/components/ui/kit'
import type { DesignDoc } from '@/doc/schema'
import { renderThumbnail } from '@/export/raster'
import { ago } from '@/features/collab/comments'
import { canEdit, useEditor } from '@/stores/editor'

type Version = { id: string; label: string; auto: boolean; created_at: string; author: string | null }

const PREVIEW_PAGES = 3

export default function VersionsPane() {
  const designId = useEditor((s) => s.designId)
  const guest = useEditor((s) => s.guest)
  const editable = canEdit(useEditor((s) => s.role))
  const [versions, setVersions] = useState<Version[] | null>(null)
  const [error, setError] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)

  const load = () => {
    if (!designId) return
    api<{ versions: Version[] }>(`/api/designs/${designId}/versions`)
      .then((r) => {
        setVersions(r.versions)
        setError('')
      })
      .catch((e: Error) => {
        setVersions([])
        setError(e.message)
      })
  }
  useEffect(load, [designId])

  if (guest) return <Empty title="History starts once you sign in">When a design lives in your account, the server keeps a trail of earlier versions you can go back to.</Empty>
  if (!editable) return <Empty title="Version history">Only people who can edit this design can see its history.</Empty>

  const save = async () => {
    setSaving(true)
    try {
      const v = await api<Version>(`/api/designs/${designId}/versions`, { method: 'POST', json: { label: label.trim() } })
      setVersions((list) => [v, ...(list ?? [])])
      setLabel('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-card border border-line p-3 flex flex-col gap-2">
        <p className="text-[13px] font-semibold">Save this version</p>
        <Input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void save()} placeholder="Name it, e.g. Sent to client" maxLength={120} aria-label="Version name" />
        <Button variant="primary" size="sm" disabled={saving} onClick={() => void save()}>
          <Icon name="clock" size={14} /> {saving ? 'Saving…' : 'Save version'}
        </Button>
      </div>
      <p className="text-[12px] text-muted">We also keep versions automatically as you work.</p>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      {versions === null ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : versions.length === 0 ? (
        <Empty title="No versions yet">Save one above, or keep editing and we'll save some for you.</Empty>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {versions.map((v) => (
            <VersionRow key={v.id} v={v} open={openId === v.id} onToggle={() => setOpenId(openId === v.id ? null : v.id)} onRestored={load} />
          ))}
        </ul>
      )}
    </div>
  )
}

function VersionRow({ v, open, onToggle, onRestored }: { v: Version; open: boolean; onToggle: () => void; onRestored: () => void }) {
  const designId = useEditor((s) => s.designId)
  const [thumbs, setThumbs] = useState<string[] | null>(null)
  const [pages, setPages] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || thumbs) return
    let live = true
    api<{ doc: DesignDoc }>(`/api/designs/${designId}/versions/${v.id}`)
      .then(async ({ doc }) => {
        const list = doc?.pages ?? []
        if (live) setPages(list.length)
        const out: string[] = []
        for (const p of list.slice(0, PREVIEW_PAGES)) out.push(await renderThumbnail(p, 360))
        if (live) setThumbs(out)
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [open, thumbs, designId, v.id])

  const restore = async () => {
    if (!confirm('Restore this version? What you have now is saved as a version first, so you can come back to it.')) return
    setBusy(true)
    try {
      await api(`/api/designs/${designId}/versions/${v.id}/restore`, { method: 'POST' })
      // the new pages arrive over the live connection; jump to the first once they land
      setTimeout(() => {
        const first = useEditor.getState().doc?.getSnapshot().pages[0]
        if (first) useEditor.getState().setPage(first.id)
      }, 600)
      onRestored()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const when = new Date(v.created_at)
  return (
    <li className={cx('rounded-card border transition', open ? 'border-accent-line bg-accent-wash/30' : 'border-line hover:border-line-2')}>
      <button onClick={onToggle} className="w-full text-left px-3 py-2.5" aria-expanded={open}>
        <p className="text-[13px] font-medium text-ink truncate">{v.label || (v.auto ? 'Autosave' : 'Saved version')}</p>
        <p className="text-[11px] text-muted" title={when.toLocaleString()}>
          {ago(v.created_at)}
          {v.author && ` · ${v.author}`}
          {v.auto && ' · automatic'}
        </p>
      </button>
      {open && (
        <div className="px-3 pb-3 flex flex-col gap-2.5">
          {error ? (
            <p className="text-[12px] text-danger">{error}</p>
          ) : !thumbs ? (
            <div className="h-24 flex items-center justify-center"><Spinner /></div>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {thumbs.map((src, i) => (
                <div key={i} className={cx('rounded-lg border border-line bg-surface-2 flex items-center justify-center overflow-hidden', thumbs.length === 1 ? 'col-span-3 aspect-video' : 'aspect-square')}>
                  <img src={src} alt={`Page ${i + 1}`} className="max-h-full max-w-full object-contain" />
                </div>
              ))}
              {pages > PREVIEW_PAGES && <p className="col-span-3 text-[11px] text-muted">and {pages - PREVIEW_PAGES} more page{pages - PREVIEW_PAGES > 1 ? 's' : ''}</p>}
            </div>
          )}
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void restore()}>{busy ? 'Restoring…' : 'Restore this version'}</Button>
        </div>
      )}
    </li>
  )
}
