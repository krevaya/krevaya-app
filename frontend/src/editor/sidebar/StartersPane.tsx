import { Icon } from '@/components/icons'
import { useState } from 'react'
import { Chip, cx, Empty, Input, Spinner } from '@/components/ui/kit'
import { cloneElements } from '@/doc/factory'
import type { Page } from '@/doc/schema'
import { uid } from '@/lib/id'
import { useTemplateThumb } from '@/lib/templateThumbs'
import { loadTemplateDoc, useTemplates, type Template } from '@/lib/templates'
import { canEdit, useEditor } from '@/stores/editor'
import { currentPage } from '../actions'
import { resizedElements } from '../resize'

type Mode = 'replace' | 'add'

/** Copy a template's pages into the open design, sized to the current page. */
async function placeTemplate(t: Template, mode: Mode) {
  const tpl = await loadTemplateDoc(t.id, t.updated_at)
  const { doc, role } = useEditor.getState()
  const cur = currentPage()
  if (!doc || !cur || !canEdit(role) || !tpl.pages.length) return
  const pages: Page[] = tpl.pages.map((p) => {
    const resize = p.width !== cur.width || p.height !== cur.height
    const els = resize ? resizedElements(p, cur.width, cur.height) : p.elements
    return { ...structuredClone({ ...p, elements: [] }), id: uid(), width: cur.width, height: cur.height, elements: cloneElements(els) }
  })
  const at = doc.getSnapshot().pages.findIndex((p) => p.id === cur.id)
  doc.breakUndo()
  doc.transact(() => {
    pages.forEach((p, i) => doc.addPage(p, at + 1 + i))
    if (mode === 'replace') doc.removePage(cur.id)
  })
  doc.breakUndo()
  useEditor.getState().setPage(pages[0].id)
  useEditor.setState({ autoFit: true })
}

export default function StartersPane() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const all = useTemplates()
  const data = useTemplates(cat, q.trim())
  const editable = useEditor((s) => canEdit(s.role))
  const [asking, setAsking] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  const use = async (t: Template, mode: Mode) => {
    setAsking(null)
    setBusy(t.id)
    setError('')
    try {
      await placeTemplate(t, mode)
    } catch {
      setError("Couldn't load that template. Check your connection and try again.")
    } finally {
      setBusy(null)
    }
  }

  if (all?.offline) {
    return (
      <Empty title="Templates need a connection">
        They live on the server, so they'll show up here once you're back online. Everything else in the editor still works.
      </Empty>
    )
  }

  const categories = all?.categories ?? []
  return (
    <div className="flex flex-col">
      <Input icon={<Icon name="search" size={16} />} placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Chip active={!cat} onClick={() => setCat('')} className="shrink-0">All</Chip>
          {categories.map((c) => (
            <Chip key={c} active={cat === c} onClick={() => setCat(c)} className="shrink-0 capitalize">{c}</Chip>
          ))}
        </div>
      )}
      {!editable && <p className="mt-4 text-[12px] text-muted">You can look, but you need edit access to use a template here.</p>}
      {error && <p className="mt-4 text-[12px] text-danger" role="alert">{error}</p>}
      {!data ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : data.templates.length === 0 ? (
        <Empty title={q || cat ? 'Nothing matches that' : 'No templates yet'}>
          {q || cat ? 'Try another word or category.' : 'An admin can add some from any design with File, Save as template.'}
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-2 mt-4 items-start">
          {masonry(data.templates).map((col, i) => (
            <div key={i} className="flex flex-col gap-2">
              {col.map((t) => (
                <TemplateTile
                  key={t.id}
                  t={t}
                  disabled={!editable || busy !== null}
                  busy={busy === t.id}
                  asking={asking === t.id}
                  onAsk={() => setAsking(asking === t.id ? null : t.id)}
                  onCancel={() => setAsking(null)}
                  onUse={(mode) => void use(t, mode)}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const tileRatio = (t: Template) => Math.min(1.8, Math.max(0.56, t.width / t.height))

/** Two columns, each template going into the shorter one, so the order still reads left to right. */
function masonry(list: Template[]): [Template[], Template[]] {
  const cols: [Template[], Template[]] = [[], []]
  const heights = [0, 0]
  for (const t of list) {
    const i = heights[0] <= heights[1] ? 0 : 1
    cols[i].push(t)
    heights[i] += 1 / tileRatio(t) + 0.15
  }
  return cols
}

function TemplateTile({ t, disabled, busy, asking, onAsk, onCancel, onUse }: {
  t: Template
  disabled: boolean
  busy: boolean
  asking: boolean
  onAsk: () => void
  onCancel: () => void
  onUse: (mode: Mode) => void
}) {
  const thumb = useTemplateThumb(t)
  const ratio = tileRatio(t)
  const multi = t.page_count > 1
  return (
    <div>
      <div
        className="relative rounded-tile border border-line bg-surface-2 overflow-hidden group"
        style={{ aspectRatio: String(ratio) }}
      >
        <button
          onClick={onAsk}
          disabled={disabled}
          title={t.title}
          aria-label={`Use template: ${t.title}`}
          aria-expanded={asking}
          className="absolute inset-0 w-full h-full flex items-center justify-center disabled:cursor-default"
        >
          {thumb ? (
            <img src={thumb} alt="" draggable={false} className="w-full h-full object-cover transition group-hover:scale-[1.02]" />
          ) : (
            <Spinner />
          )}
        </button>
        {multi && !asking && (
          <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 text-white text-[11px] px-1.5 py-0.5 pointer-events-none">
            {t.page_count} pages
          </span>
        )}
        {busy && <div className="absolute inset-0 bg-surface/70 flex items-center justify-center"><Spinner /></div>}
        {asking && (
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px] p-2 flex flex-col justify-center gap-1.5"
            onKeyDown={(e) => e.key === 'Escape' && onCancel()}
          >
            <button onClick={onCancel} aria-label="Cancel" className="absolute top-1 right-1 h-6 w-6 rounded-md text-white/80 hover:bg-white/15 flex items-center justify-center">
              <Icon name="x" size={14} />
            </button>
            <ConfirmButton onClick={() => onUse('replace')}>Replace this page</ConfirmButton>
            <ConfirmButton onClick={() => onUse('add')} subtle>{multi ? `Add ${t.page_count} pages after` : 'Add as a new page'}</ConfirmButton>
          </div>
        )}
      </div>
      <p className="mt-1 text-[12px] text-ink-2 truncate" title={t.title}>{t.title}</p>
    </div>
  )
}

function ConfirmButton({ children, onClick, subtle }: { children: string; onClick: () => void; subtle?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'w-full min-h-8 px-2 py-1 rounded-[10px] text-[12px] font-medium leading-tight transition',
        subtle ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white text-ink hover:bg-white/90',
      )}
    >
      {children}
    </button>
  )
}
