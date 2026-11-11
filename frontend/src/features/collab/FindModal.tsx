import { Icon } from '@/components/icons'
import { useEffect, useMemo, useState } from 'react'
import { Button, cx, GlyphButton, Input } from '@/components/ui/kit'
import { Modal } from '@/components/ui/Flyout'
import type { DesignElement } from '@/doc/schema'
import { updateElements } from '@/editor/actions'
import type { ModalProps } from '@/editor/modals'
import { useDoc } from '@/editor/hooks'
import { canEdit, useEditor } from '@/stores/editor'

type Match = { pageId: string; pageIndex: number; elId: string; start: number; text: string }

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export function FindModal({ onClose }: ModalProps) {
  const doc = useDoc()
  const editable = canEdit(useEditor((s) => s.role))
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [index, setIndex] = useState(0)
  const [note, setNote] = useState('')

  const pattern = useMemo(() => (query ? new RegExp(escape(query), matchCase ? 'g' : 'gi') : null), [query, matchCase])

  const matches = useMemo(() => {
    const out: Match[] = []
    if (!pattern) return out
    doc.pages.forEach((page, pageIndex) => {
      for (const el of page.elements) {
        if (el.type !== 'text') continue
        for (const m of el.text.matchAll(pattern)) out.push({ pageId: page.id, pageIndex, elId: el.id, start: m.index ?? 0, text: el.text })
      }
    })
    return out
  }, [doc, pattern])

  const current = matches.length ? matches[Math.min(index, matches.length - 1)] : null

  // Bring the current match into view.
  useEffect(() => {
    if (!current) return
    const s = useEditor.getState()
    if (s.pageId !== current.pageId) s.setPage(current.pageId)
    s.select([current.elId])
  }, [current?.elId, current?.pageId, current?.start]) // eslint-disable-line react-hooks/exhaustive-deps

  const step = (d: number) => matches.length && setIndex((i) => (Math.min(i, matches.length - 1) + d + matches.length) % matches.length)

  const replaceOne = () => {
    if (!current) return
    const el = useEditor.getState().doc?.element(current.elId)
    if (!el || el.type !== 'text') return
    const text = el.text.slice(0, current.start) + replacement + el.text.slice(current.start + query.length)
    useEditor.getState().doc?.breakUndo()
    updateElements([[el.id, { text }]])
    setNote('')
  }

  const replaceAll = () => {
    if (!pattern) return
    const patches: Array<[string, Partial<DesignElement>]> = []
    let n = 0
    for (const page of doc.pages) {
      for (const el of page.elements) {
        if (el.type !== 'text') continue
        const text = el.text.replace(pattern, () => {
          n++
          return replacement
        })
        if (text !== el.text) patches.push([el.id, { text }])
      }
    }
    if (!patches.length) return
    useEditor.getState().doc?.breakUndo()
    updateElements(patches)
    setNote(`Replaced ${n} match${n === 1 ? '' : 'es'}.`)
    setIndex(0)
  }

  const snippet = (m: Match) => {
    const from = Math.max(0, m.start - 24)
    const to = Math.min(m.text.length, m.start + query.length + 32)
    return (
      <>
        {from > 0 && '…'}
        {m.text.slice(from, m.start)}
        <mark className="bg-accent-wash text-accent rounded px-0.5">{m.text.slice(m.start, m.start + query.length)}</mark>
        {m.text.slice(m.start + query.length, to)}
        {to < m.text.length && '…'}
      </>
    )
  }

  return (
    <Modal open onClose={onClose} title="Find and replace" width={480}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          <Input
            autoFocus
            className="flex-1"
            icon={<Icon name="search" size={15} />}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIndex(0)
              setNote('')
            }}
            onKeyDown={(e) => e.key === 'Enter' && step(e.shiftKey ? -1 : 1)}
            placeholder="Find text on every page"
            aria-label="Find"
          />
          <GlyphButton label="Previous match" onClick={() => step(-1)} disabled={!matches.length}><Icon name="chevron-up" size={16} /></GlyphButton>
          <GlyphButton label="Next match" onClick={() => step(1)} disabled={!matches.length}><Icon name="chevron-down" size={16} /></GlyphButton>
        </div>
        <div className="flex items-center justify-between text-[12px]">
          <label className="flex items-center gap-2 text-ink-2 cursor-pointer select-none">
            <input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
            Match case
          </label>
          <span className="text-muted tabular-nums" aria-live="polite">
            {!query ? '' : matches.length ? `${Math.min(index, matches.length - 1) + 1} of ${matches.length}` : 'No matches'}
          </span>
        </div>
        {editable && (
          <>
            <Input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="Replace with" aria-label="Replace with" />
            <div className="flex gap-2 justify-end">
              <Button size="sm" disabled={!current} onClick={replaceOne}>Replace</Button>
              <Button size="sm" variant="primary" disabled={!matches.length} onClick={replaceAll}>Replace all</Button>
            </div>
          </>
        )}
        {note && <p className="text-[13px] text-ink-2" role="status">{note}</p>}
        {matches.length > 0 && (
          <ul className="max-h-[220px] overflow-y-auto scroll-thin -mx-1 flex flex-col gap-0.5">
            {matches.map((m, i) => (
              <li key={`${m.elId}:${m.start}`}>
                <button
                  onClick={() => setIndex(i)}
                  className={cx('w-full text-left px-2.5 py-1.5 rounded-lg text-[13px] flex gap-2', i === Math.min(index, matches.length - 1) ? 'bg-accent-wash/60' : 'hover:bg-hover')}
                >
                  <span className="text-faint shrink-0 w-12">Page {m.pageIndex + 1}</span>
                  <span className="truncate text-ink-2">{snippet(m)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
