import { Icon } from '@/components/icons'
import { useState } from 'react'
import { Button, cx, ChoiceRow } from '@/components/ui/kit'
import type { DesignElement } from '@/doc/schema'
import { canEdit, useEditor } from '@/stores/editor'
import { align, distribute, groupSelection, reorder, ungroupSelection, updateElement, updateSelected } from '../actions'
import { usePage, useSelected } from '../hooks'

function label(el: DesignElement) {
  if (el.name) return el.name
  if (el.type === 'text') return el.text.split('\n')[0].slice(0, 40) || 'Text'
  if (el.type === 'shape') return el.shape.replace('-', ' ')
  if (el.type === 'svg') return el.kind === 'qr' ? 'QR code' : el.kind
  if (el.type === 'image') return 'Photo'
  return 'Line'
}

function TypeIcon({ el }: { el: DesignElement }) {
  const p = { size: 15, className: 'text-muted shrink-0' }
  if (el.type === 'text') return <Icon name="text" {...p} />
  if (el.type === 'image') return <Icon name="image" {...p} />
  if (el.type === 'line') return <Icon name="minus" {...p} />
  return <Icon name="shapes" {...p} />
}

export default function ArrangePane() {
  const [tab, setTab] = useState<'arrange' | 'layers'>('arrange')
  return (
    <div className="flex flex-col gap-4">
      <ChoiceRow value={tab} onChange={setTab} options={[{ value: 'arrange', label: 'Arrange' }, { value: 'layers', label: 'Layers' }]} />
      {tab === 'arrange' ? <Arrange /> : <Layers />}
    </div>
  )
}

function Arrange() {
  const els = useSelected()
  const editable = canEdit(useEditor((s) => s.role))
  if (!els.length) return <p className="text-[13px] text-muted">Select something on the page to move it forward, back or line it up.</p>
  const one = els.length === 1 ? els[0] : null
  const grouped = els.some((e) => e.groupId)
  const btn = 'h-10 rounded-control border border-line text-[13px] flex items-center gap-2 px-3 hover:bg-hover disabled:opacity-40'
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-2">
        <button className={btn} disabled={!editable} onClick={() => reorder('forward')}><Icon name="layer-forward" size={15} />Forward</button>
        <button className={btn} disabled={!editable} onClick={() => reorder('backward')}><Icon name="layer-backward" size={15} />Backward</button>
        <button className={btn} disabled={!editable} onClick={() => reorder('front')}><Icon name="layer-front" size={15} />To front</button>
        <button className={btn} disabled={!editable} onClick={() => reorder('back')}><Icon name="layer-back" size={15} />To back</button>
      </div>
      <div>
        <p className="text-[13px] font-semibold mb-2">{els.length > 1 ? 'Align elements' : 'Align to page'}</p>
        <div className="grid grid-cols-2 gap-2">
          <button className={btn} onClick={() => align('top')}><Icon name="align-top" size={15} />Top</button>
          <button className={btn} onClick={() => align('left')}><Icon name="align-left" size={15} />Left</button>
          <button className={btn} onClick={() => align('middle')}><Icon name="align-middle" size={15} />Middle</button>
          <button className={btn} onClick={() => align('center')}><Icon name="align-center" size={15} />Center</button>
          <button className={btn} onClick={() => align('bottom')}><Icon name="align-bottom" size={15} />Bottom</button>
          <button className={btn} onClick={() => align('right')}><Icon name="align-right" size={15} />Right</button>
        </div>
      </div>
      {els.length > 2 && (
        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => distribute('h')}>Space evenly ↔</Button>
          <Button onClick={() => distribute('v')}>Space evenly ↕</Button>
        </div>
      )}
      {els.length > 1 && (grouped ? <Button onClick={ungroupSelection}>Ungroup</Button> : <Button onClick={groupSelection}>Group</Button>)}
      {one && editable && (
        <div>
          <p className="text-[13px] font-semibold mb-2">Size and position</p>
          <div className="grid grid-cols-2 gap-2">
            {(['width', 'height', 'x', 'y', 'rotation'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 h-9 px-2.5 rounded-lg border border-line text-[12px] text-muted">
                <span className="w-4 uppercase">{k === 'rotation' ? '°' : k[0]}</span>
                <SizeInput key={one.id} k={k} value={one[k]} />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SizeInput({ k, value }: { k: 'width' | 'height' | 'x' | 'y' | 'rotation'; value: number }) {
  // a draft while typing, so clearing the box to retype doesn't squash the element to nothing
  const [draft, setDraft] = useState<string | null>(null)
  return (
    <input
      type="number"
      className="flex-1 min-w-0 bg-transparent text-ink outline-none tabular-nums"
      value={draft ?? Math.round(value * 10) / 10}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = Number(e.target.value)
        if (e.target.value === '' || !Number.isFinite(n) || ((k === 'width' || k === 'height') && n < 1)) return
        updateSelected({ [k]: n })
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      aria-label={k}
    />
  )
}

function Layers() {
  const page = usePage()
  const selection = useEditor((s) => s.selection)
  const editable = canEdit(useEditor((s) => s.role))
  const [drag, setDrag] = useState<string | null>(null)
  const [over, setOver] = useState<number | null>(null)
  if (!page) return null
  const list = [...page.elements].reverse()
  const s = useEditor.getState
  return (
    <div className="flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[13px] font-semibold">Layers <span className="ml-1 text-[11px] text-muted bg-surface-2 border border-line rounded-md px-1.5">{list.length}</span></p>
        <button className="text-[12px] text-muted hover:text-ink" onClick={() => s().select(page.elements.filter((e) => !e.locked).map((e) => e.id))}>Select all</button>
      </div>
      <p className="text-[12px] text-muted mb-3">Front at the top · Drag to reorder</p>
      {!list.length && <p className="text-[13px] text-muted py-6 text-center">This page is empty. Add something from the left to see it here.</p>}
      <ul className="flex flex-col gap-1.5">
        {list.map((el, i) => {
          const active = selection.includes(el.id)
          return (
            <li
              key={el.id}
              draggable={editable}
              onDragStart={() => setDrag(el.id)}
              onDragOver={(e) => {
                e.preventDefault()
                setOver(i)
              }}
              onDragEnd={() => {
                setDrag(null)
                setOver(null)
              }}
              onDrop={() => {
                if (drag && drag !== el.id) s().doc?.reorder([drag], page.elements.length - 1 - i)
                setDrag(null)
                setOver(null)
              }}
              className={cx(
                'group flex items-center gap-2 h-12 px-2.5 rounded-control border transition cursor-pointer',
                active ? 'border-accent bg-accent-wash' : 'border-line hover:bg-hover',
                over === i && drag && 'ring-2 ring-accent-soft',
                el.hidden && 'opacity-50',
              )}
              onClick={(e) => (e.shiftKey ? s().select([...selection, el.id]) : s().select([el.id]))}
            >
              <TypeIcon el={el} />
              <span className={cx('flex-1 truncate text-[13px]', el.type !== 'text' && !el.name && 'capitalize')}>{label(el)}</span>
              {el.groupId && <span className="text-[10px] text-muted border border-line rounded px-1">group</span>}
              {editable && (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      updateElement(el.id, { hidden: !el.hidden || undefined })
                    }}
                    className={cx('h-7 w-7 rounded-md hover:bg-surface flex items-center justify-center text-muted', !el.hidden && 'opacity-0 group-hover:opacity-100')}
                    aria-label={el.hidden ? 'Show' : 'Hide'}
                  >
                    {el.hidden ? <Icon name="eye-off" size={14} /> : <Icon name="eye" size={14} />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      updateElement(el.id, { locked: !el.locked || undefined })
                    }}
                    className={cx('h-7 w-7 rounded-md hover:bg-surface flex items-center justify-center text-muted', !el.locked && 'opacity-0 group-hover:opacity-100')}
                    aria-label={el.locked ? 'Unlock' : 'Lock'}
                  >
                    {el.locked ? <Icon name="lock" size={14} /> : <Icon name="unlock" size={14} />}
                  </button>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {editable && selection.length === 1 && (
        <RenameLayer key={selection[0]} id={selection[0]} />
      )}
    </div>
  )
}

function RenameLayer({ id }: { id: string }) {
  const el = useEditor.getState().doc?.element(id)
  const [v, setV] = useState(el?.name ?? '')
  if (!el) return null
  return (
    <label className="mt-4 flex flex-col gap-1.5 text-[12px] text-muted">
      Layer name
      <input
        value={v}
        placeholder={label(el)}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => updateElement(id, { name: v.trim() || undefined })}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        className="h-9 rounded-lg border border-line-2 px-2.5 text-[13px] text-ink bg-surface"
      />
    </label>
  )
}
