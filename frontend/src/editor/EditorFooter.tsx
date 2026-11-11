import { Icon } from '@/components/icons'
import { memo, useEffect, useState } from 'react'
import { useLocation } from 'wouter'
import { Button, cx } from '@/components/ui/kit'
import { newPage } from '@/doc/factory'
import { formatLabel } from '@/doc/formats'
import type { Page } from '@/doc/schema'
import { renderThumbnail } from '@/export/raster'
import { canEdit, useEditor } from '@/stores/editor'
import { useDoc, usePage } from './hooks'
import { editorModals } from './modals'

export function EditorFooter() {
  const doc = useDoc()
  const page = usePage()
  const role = useEditor((s) => s.role)
  const guest = useEditor((s) => s.guest)
  const [strip, setStrip] = useState(false)
  const [, go] = useLocation()
  if (!page) return null
  const index = doc.pages.findIndex((p) => p.id === page.id)
  const editable = canEdit(role)
  const goto = (i: number) => {
    const p = doc.pages[Math.max(0, Math.min(doc.pages.length - 1, i))]
    if (p) useEditor.getState().setPage(p.id)
  }

  return (
    <div className="shrink-0 border-t border-line bg-surface">
      {strip && <PageReel pages={doc.pages} current={page.id} editable={editable} />}
      <div className="h-14 flex items-center gap-2 px-4">
        <div className="h-9 flex items-center gap-2 px-3 rounded-control border border-line text-[13px] text-ink-2">
          <span className="font-medium text-ink">{formatLabel(page.width, page.height)}</span>
          <span className="text-faint">·</span>
          <span className="tabular-nums">{page.width} × {page.height}</span>
        </div>
        <div className="flex items-center gap-0.5 ml-2">
          <button className="h-8 w-8 rounded-lg hover:bg-hover disabled:opacity-30 flex items-center justify-center" disabled={index <= 0} onClick={() => goto(index - 1)} aria-label="Previous page"><Icon name="chevron-left" size={16} /></button>
          <span className="text-[13px] tabular-nums text-ink-2 px-1">Page {index + 1} / {doc.pages.length}</span>
          <button className="h-8 w-8 rounded-lg hover:bg-hover disabled:opacity-30 flex items-center justify-center" disabled={index >= doc.pages.length - 1} onClick={() => goto(index + 1)} aria-label="Next page"><Icon name="chevron-right" size={16} /></button>
          <button className={cx('h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-[13px]', strip ? 'bg-accent-wash text-accent' : 'hover:bg-hover text-ink-2')} onClick={() => setStrip(!strip)} aria-pressed={strip}>
            <Icon name="grid" size={15} /> Pages
          </button>
          {editable && (
            <button
              className="h-8 px-2.5 rounded-lg hover:bg-hover flex items-center gap-1.5 text-[13px] text-ink-2"
              onClick={() => {
                const s = useEditor.getState()
                const p = newPage(page.width, page.height)
                s.doc?.addPage(p, index + 1)
                s.setPage(p.id)
              }}
            >
              <Icon name="plus" size={15} /> Add page
            </button>
          )}
          <button
            className="h-8 px-2.5 rounded-lg hover:bg-hover flex items-center gap-1.5 text-[13px] text-ink-2"
            onClick={() => useEditor.getState().openPanel('notes')}
          >
            <Icon name="doc-text" size={15} /> Notes
          </button>
        </div>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => useEditor.setState({ presenting: true })}>
          <Icon name="video" size={16} /> Present
        </Button>
        <Button variant="primary" onClick={() => editorModals.show('export')}>
          <Icon name="download" size={16} /> Download
        </Button>
        <Button variant="outline" onClick={() => go(guest ? '/designs' : '/designs')}>Done</Button>
      </div>
    </div>
  )
}

const Thumb = memo(function Thumb({ page }: { page: Page }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let live = true
    const t = setTimeout(() => {
      renderThumbnail(page, 200).then((s) => live && setSrc(s)).catch(() => {})
    }, 250)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [page])
  return src ? <img src={src} alt="" className="h-full w-full object-contain" draggable={false} /> : null
})

function PageReel({ pages, current, editable }: { pages: Page[]; current: string; editable: boolean }) {
  const [dragId, setDragId] = useState<string | null>(null)
  const s = useEditor.getState
  return (
    <div className="h-[118px] flex items-center gap-3 px-4 overflow-x-auto scroll-thin border-b border-line bg-surface-2">
      {pages.map((p, i) => (
        <div
          key={p.id}
          draggable={editable}
          onDragStart={() => setDragId(p.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (dragId && dragId !== p.id) s().doc?.movePage(dragId, i)
            setDragId(null)
          }}
          className="group relative shrink-0 flex flex-col items-center gap-1"
        >
          <button
            onClick={() => s().setPage(p.id)}
            className={cx('h-[84px] rounded-lg border-2 bg-white overflow-hidden', p.id === current ? 'border-accent' : 'border-transparent hover:border-line-2')}
            style={{ width: Math.max(48, Math.min(150, (84 * p.width) / p.height)) }}
            aria-label={`Page ${i + 1}`}
          >
            <Thumb page={p} />
          </button>
          <span className="text-[11px] text-muted">{i + 1}</span>
          {editable && (
            <div className="absolute top-1 right-1 hidden group-hover:flex gap-0.5">
              <button onClick={() => { const id = s().doc?.duplicatePage(p.id); if (id) s().setPage(id) }} className="h-6 w-6 rounded-md bg-surface/90 border border-line flex items-center justify-center" title="Duplicate page"><Icon name="copy" size={12} /></button>
              {pages.length > 1 && (
                <button
                  onClick={() => {
                    const next = pages[i + 1] ?? pages[i - 1]
                    s().doc?.removePage(p.id)
                    if (p.id === current && next) s().setPage(next.id)
                  }}
                  className="h-6 w-6 rounded-md bg-surface/90 border border-line flex items-center justify-center text-danger"
                  title="Delete page"
                >
                  <Icon name="trash" size={12} />
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
