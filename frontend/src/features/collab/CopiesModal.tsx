import { Icon } from '@/components/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@/api/client'
import { Button, cx } from '@/components/ui/kit'
import { Modal } from '@/components/ui/Flyout'
import type { ModalProps } from '@/editor/modals'
import { useDoc } from '@/editor/hooks'
import { editorModals } from '@/editor/modals'
import { useEditor } from '@/stores/editor'
import { readTable } from './csv'
import { slotName } from './MiscModals'

const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')

type Result = { made: Array<{ id: string; title: string }>; failed: Array<{ row: number; reason: string }> }

export function CopiesModal({ onClose }: ModalProps) {
  const doc = useDoc()
  const designId = useEditor((s) => s.designId)
  const file = useRef<HTMLInputElement>(null)
  const [text, setText] = useState('')
  // the server decides how many rows one request may have (COPIES_PER_REQUEST)
  const [maxRows, setMaxRows] = useState(100)
  useEffect(() => {
    api<{ copies_per_request?: number }>('/api/config').then((c) => c.copies_per_request && setMaxRows(c.copies_per_request)).catch(() => {})
  }, [])
  const [map, setMap] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  const fields = useMemo(() => {
    const out = new Map<string, string>()
    for (const p of doc.pages) {
      for (const el of p.elements) {
        const name = slotName(el)
        if (name && !out.has(name)) out.set(name, el.type === 'image' ? 'photo link' : el.type)
      }
    }
    return [...out.entries()].map(([key, kind]) => ({ key, kind }))
  }, [doc])

  const rows = useMemo(() => readTable(text), [text])
  const header = rows[0] ?? []
  const body = rows.slice(1, maxRows + 1)

  // a column named like a slot is matched up without asking
  const columnFor = (key: string) => {
    if (key in map) return map[key]
    const hit = header.find((h) => norm(h) === norm(key))
    return hit ?? ''
  }

  const payload = body.map((r) => {
    const out: Record<string, string> = {}
    for (const f of fields) {
      const col = columnFor(f.key)
      const i = col ? header.indexOf(col) : -1
      if (i >= 0) out[f.key] = (r[i] ?? '').trim()
    }
    return out
  })
  const mapped = fields.filter((f) => columnFor(f.key))

  const readFile = async (f: File) => {
    setText(await f.text())
    setMap({})
    setResult(null)
  }

  const run = async () => {
    setBusy(true)
    setError('')
    try {
      setResult(await api<Result>(`/api/designs/${designId}/copies`, { method: 'POST', json: { rows: payload } }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!fields.length) {
    return (
      <Modal open onClose={onClose} title="Copies from a spreadsheet" width={480}>
        <div className="flex flex-col gap-3 text-[13px] text-muted leading-relaxed">
          <p>Each row of your spreadsheet becomes its own copy of this design, with that row's words and photos dropped in.</p>
          <p>This design has no slots yet. Select a text box, photo or QR code, open <span className="text-ink">⋯ → Slot name</span> and call it something like <code className="text-ink">guest_name</code>. Matching column headings get filled in automatically.</p>
          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" disabled={useEditor.getState().selection.length !== 1} onClick={() => editorModals.show('slot')}>Name a slot</Button>
          </div>
        </div>
      </Modal>
    )
  }

  if (result) {
    return (
      <Modal open onClose={onClose} title="Copies from a spreadsheet" width={520} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
        <p className="text-[14px] text-ink mb-3">
          Made {result.made.length} design{result.made.length === 1 ? '' : 's'}.
          {result.failed.length > 0 && ` ${result.failed.length} row${result.failed.length === 1 ? '' : 's'} couldn't be used.`}
        </p>
        {result.made.length > 0 && (
          <ul className="flex flex-col gap-1 max-h-[300px] overflow-y-auto scroll-thin">
            {result.made.map((d) => (
              <li key={d.id}>
                <a href={`/design/${d.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 h-9 px-3 rounded-lg border border-line text-[13px] hover:bg-hover">
                  <span className="flex-1 truncate">{d.title}</span>
                  <Icon name="external" size={14} className="text-muted" />
                </a>
              </li>
            ))}
          </ul>
        )}
        {result.failed.length > 0 && (
          <ul className="mt-3 flex flex-col gap-1 text-[13px] text-danger">
            {/* the server counts rows from 0, the preview above from 1 */}
            {result.failed.map((e) => <li key={e.row}>Row {e.row + 1}: {e.reason}</li>)}
          </ul>
        )}
      </Modal>
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Copies from a spreadsheet"
      width={640}
      footer={
        <>
          <span className="mr-auto self-center text-[12px] text-muted">
            {body.length ? `${body.length} design${body.length === 1 ? '' : 's'} will be made` : ''}
            {rows.length - 1 > maxRows && ` (first ${maxRows} rows)`}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy || !body.length || !mapped.length} onClick={() => void run()}>
            {busy ? 'Creating…' : `Create ${body.length || ''} designs`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-muted">Paste cells straight from your spreadsheet, or upload a CSV. Put column headings in the first row.</p>
        <div className="flex gap-2">
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setResult(null)
            }}
            placeholder={`${fields.map((f) => f.key).join(',')}\n…`}
            rows={5}
            aria-label="CSV data"
            className="flex-1 rounded-control border border-line-2 bg-surface p-3 text-[12px] font-mono leading-relaxed resize-y outline-none focus:border-accent-soft"
          />
          <button
            onClick={() => file.current?.click()}
            className="w-[120px] shrink-0 rounded-control border border-dashed border-line-2 text-[12px] text-muted hover:bg-hover flex flex-col items-center justify-center gap-1.5"
          >
            <Icon name="upload" size={18} />
            Upload .csv
          </button>
          <input ref={file} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" hidden onChange={(e) => e.target.files?.[0] && void readFile(e.target.files[0])} />
        </div>

        {header.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold mb-2">Which column goes in each slot</p>
            <div className="grid grid-cols-2 gap-2">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-2 h-10 px-3 rounded-control border border-line text-[13px]">
                  <span className="font-mono text-ink truncate flex-1" title={f.kind}>{f.key}</span>
                  <select
                    value={columnFor(f.key)}
                    onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))}
                    className="h-8 max-w-[150px] rounded-lg border border-line-2 bg-surface px-1.5 text-[12px]"
                    aria-label={`Column for ${f.key}`}
                  >
                    <option value="">Leave as is</option>
                    {header.map((h, i) => <option key={i} value={h}>{h || `Column ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
        )}

        {body.length > 0 && mapped.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold mb-2 flex items-center gap-1.5"><Icon name="doc-text" size={14} /> Preview</p>
            <div className="overflow-x-auto scroll-thin rounded-control border border-line">
              <table className="w-full text-[12px]">
                <thead className="bg-surface-2 text-muted">
                  <tr>
                    <th className="text-left font-medium px-2.5 py-1.5 w-8">#</th>
                    {mapped.map((f) => <th key={f.key} className="text-left font-medium px-2.5 py-1.5 font-mono">{f.key}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {payload.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-2.5 py-1.5 text-faint">{i + 1}</td>
                      {mapped.map((f) => <td key={f.key} className={cx('px-2.5 py-1.5 max-w-[200px] truncate', !r[f.key] && 'text-faint')}>{r[f.key] || 'empty'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {body.length > 5 && <p className="text-[12px] text-muted mt-1.5">and {body.length - 5} more</p>}
          </div>
        )}
        {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
      </div>
    </Modal>
  )
}
