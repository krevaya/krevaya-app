import { Icon } from '@/components/icons'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '@/components/ui/kit'
import { MenuList, type MenuItem } from '@/components/ui/Flyout'
import type { DesignElement, TextElement } from '@/doc/schema'
import { pickReplacement } from '@/features/photos/media'
import { canEdit, useEditor } from '@/stores/editor'
import {
  copySelection, cutSelection, deleteSelected, duplicateSelected, groupSelection, pasteElements, reorder, selected,
  toggleLock, ungroupSelection, updateElement,
} from './actions'
import { CanvasEngine, type View } from './canvas/engine'
import { canvasHooks } from './canvas/hooks'
import { usePage } from './hooks'
import { EdgeScales } from './canvas/EdgeScales'

let engineRef: CanvasEngine | null = null
export const getEngine = () => engineRef

export function Canvas() {
  const host = useRef<HTMLDivElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [engine, setEngine] = useState<CanvasEngine | null>(null)
  const [view, setView] = useState<View | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  // ring the canvas only when it was reached with the keyboard, not after every click
  const [kbdFocus, setKbdFocus] = useState(false)
  const pointerAt = useRef(0)
  const page = usePage()
  const selection = useEditor((s) => s.selection)
  const editingId = useEditor((s) => s.editingId)
  const cropId = useEditor((s) => s.cropId)
  const role = useEditor((s) => s.role)
  const zoom = useEditor((s) => s.zoom)
  const rulers = useEditor((s) => s.rulers)

  useLayoutEffect(() => {
    const el = host.current!
    const e = new CanvasEngine(el)
    engineRef = e
    e.onView = setView
    e.onContext = (x, y) => setMenu({ x, y })
    e.onDblClick = (el) => {
      if (!canEdit(useEditor.getState().role) || el.locked) return
      if (el.type === 'text') useEditor.setState({ editingId: el.id, selection: [el.id] })
      else if (el.type === 'image') useEditor.setState({ cropId: el.id, selection: [el.id] })
    }
    e.onStagePointer = (x, y, ev) => canvasHooks.pointer?.(x, y, ev) ?? false
    const ro = new ResizeObserver(() => e.resize(el.clientWidth, el.clientHeight))
    ro.observe(el)
    setEngine(e)
    return () => {
      ro.disconnect()
      e.destroy()
      engineRef = null
    }
  }, [])

  useEffect(() => {
    engine?.render(page)
  }, [engine, page, editingId, role])

  useEffect(() => {
    engine?.updateTransformer()
    engine?.stage.batchDraw()
  }, [engine, selection, cropId, editingId])

  useEffect(() => {
    if (!engine) return
    if (Math.abs(engine.view.zoom - zoom) > 0.0001) engine.zoomTo(zoom)
  }, [engine, zoom])

  const editingEl = editingId && page ? (page.elements.find((e) => e.id === editingId) as TextElement | undefined) : undefined

  return (
    <div ref={wrap} className="absolute inset-0">
      <div
        ref={host}
        id="page-canvas"
        tabIndex={0}
        role="group"
        aria-label="Page. Tab and Shift+Tab move between elements, arrow keys move the selection."
        className={cx('absolute inset-0 outline-none', kbdFocus && 'ring-2 ring-inset ring-accent', rulers && 'left-5 top-5')}
        onPointerDownCapture={() => { pointerAt.current = Date.now(); setKbdFocus(false) }}
        onFocus={() => setKbdFocus(Date.now() - pointerAt.current > 300)}
        onBlur={() => setKbdFocus(false)}
        style={{ outline: 'none' }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key !== 'Tab' || e.metaKey || e.ctrlKey || e.altKey || !page) return
          if (stepSelection(page.elements, e.shiftKey ? -1 : 1)) {
            e.preventDefault()
            setKbdFocus(true)
          }
        }}
      />
      <p className="sr-only" aria-live="polite">{describeSelection(page?.elements ?? [], selection)}</p>
      {rulers && view && page && <EdgeScales view={view} page={page} />}
      {engine && view && editingEl && editingEl.type === 'text' && <TextEditor el={editingEl} engine={engine} key={editingEl.id} />}
      {engine && view && canvasHooks.overlays.map((O, i) => <O key={i} engine={engine} view={view} />)}
      <ZoomPill />
      {menu && <ContextMenu at={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

/**
 * Keyboard selection: move to the next or previous element in layer order.
 * Returns false at either end so Tab can carry on out of the canvas.
 */
function stepSelection(elements: DesignElement[], dir: 1 | -1) {
  const s = useEditor.getState()
  const list = elements.filter((el) => !el.hidden)
  if (!list.length) return false
  const current = s.selection.length ? list.findIndex((el) => el.id === s.selection[s.selection.length - 1]) : -1
  const next = current === -1 ? (dir === 1 ? 0 : list.length - 1) : current + dir
  if (next < 0 || next >= list.length) return false
  s.select([list[next].id])
  return true
}

function elementLabel(el: DesignElement) {
  if (el.name) return el.name
  if (el.type === 'text') return `Text: ${el.text.replace(/\s+/g, ' ').slice(0, 60)}`
  if (el.type === 'image') return 'Photo'
  if (el.type === 'line') return 'Line'
  if (el.type === 'shape') return `Shape: ${el.shape}`
  return el.kind === 'icon' ? 'Icon' : 'Graphic'
}

function describeSelection(elements: DesignElement[], selection: string[]) {
  if (!selection.length) return ''
  if (selection.length > 1) return `${selection.length} elements selected`
  const i = elements.findIndex((el) => el.id === selection[0])
  if (i === -1) return ''
  return `${elementLabel(elements[i])}, ${i + 1} of ${elements.length}${elements[i].locked ? ', locked' : ''}`
}

function TextEditor({ el, engine }: { el: TextElement; engine: CanvasEngine }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [value, setValue] = useState(el.text)
  const latest = useRef(value)
  const saved = useRef(el.text)
  latest.current = value
  const box = engine.screenBox(el)
  const z = box.zoom

  useEffect(() => {
    const ta = ref.current!
    ta.focus()
    ta.select()
    // clicking the canvas ends editing before the textarea blurs, so save on the way out too
    return () => {
      if (latest.current !== saved.current && useEditor.getState().doc?.element(el.id)) updateElement(el.id, { text: latest.current })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Grow with the text, like the canvas will once it's committed.
  useLayoutEffect(() => {
    const ta = ref.current!
    ta.style.height = '0px'
    ta.style.height = `${ta.scrollHeight}px`
  }, [value, z])

  const commit = () => {
    if (value !== saved.current) updateElement(el.id, { text: value })
    saved.current = value
    useEditor.setState({ editingId: null })
  }

  const fill = el.color
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape') {
          e.preventDefault()
          commit()
        }
      }}
      spellCheck
      aria-label="Edit text"
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: Math.max(box.width, 20),
        transform: `rotate(${el.rotation}deg)`,
        transformOrigin: 'top left',
        fontFamily: `"${el.fontFamily}", Inter, sans-serif`,
        fontSize: el.fontSize * z,
        fontWeight: el.fontWeight,
        fontStyle: el.italic ? 'italic' : 'normal',
        lineHeight: el.lineHeight,
        letterSpacing: `${(el.letterSpacing / 1000) * el.fontSize * z}px`,
        textAlign: el.align,
        textTransform: el.uppercase ? 'uppercase' : 'none',
        textDecoration: [el.underline && 'underline', el.strike && 'line-through'].filter(Boolean).join(' ') || 'none',
        color: fill,
        background: 'transparent',
        border: 'none',
        outline: '1.5px solid #612bd3',
        outlineOffset: 2,
        padding: 0,
        margin: 0,
        resize: 'none',
        overflow: 'hidden',
        whiteSpace: 'pre-wrap',
        caretColor: '#612bd3',
        zIndex: 5,
      }}
    />
  )
}

function ZoomPill() {
  const zoom = useEditor((s) => s.zoom)
  const set = useEditor((s) => s.setZoom)
  const fit = () => {
    useEditor.setState({ autoFit: true })
    getEngine()?.fit()
  }
  return (
    <div className="absolute right-4 bottom-4 flex items-center gap-1 h-9 px-1.5 rounded-control border border-line bg-surface shadow-card text-[12px] text-ink-2 z-10">
      <button className="h-7 w-7 rounded-lg hover:bg-hover flex items-center justify-center" onClick={() => set(zoom / 1.2)} aria-label="Zoom out"><Icon name="minus" size={14} /></button>
      <span className="w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
      <button className="h-7 w-7 rounded-lg hover:bg-hover flex items-center justify-center" onClick={() => set(zoom * 1.2)} aria-label="Zoom in"><Icon name="plus" size={14} /></button>
      <span className="w-px h-5 bg-line mx-1" />
      <button className="h-7 px-2 rounded-lg hover:bg-hover flex items-center gap-1" onClick={fit} aria-label="Fit to screen"><Icon name="fit" size={13} />Fit</button>
    </div>
  )
}

function ContextMenu({ at, onClose }: { at: { x: number; y: number }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)
  const els: DesignElement[] = selected()
  const editable = canEdit(useEditor.getState().role)
  // keep the menu on screen when opened near the right or bottom edge
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect()
    setPos({ x: Math.max(8, Math.min(at.x, innerWidth - r.width - 8)), y: Math.max(8, Math.min(at.y, innerHeight - r.height - 8)) })
  }, [at])
  useEffect(() => {
    const down = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])
  const has = els.length > 0
  const grouped = els.some((e) => e.groupId)
  const photo = els.length === 1 && els[0].type === 'image' && !els[0].locked ? els[0] : null
  const items: MenuItem[] = editable
    ? [
        ...(photo
          ? [
              { label: 'Replace photo…', onSelect: () => pickReplacement(photo) },
              { label: 'Crop', onSelect: () => useEditor.setState({ cropId: photo.id }) },
              { type: 'sep' as const },
            ]
          : []),
        { label: 'Copy', hint: '⌘C', onSelect: copySelection, disabled: !has },
        { label: 'Cut', hint: '⌘X', onSelect: cutSelection, disabled: !has },
        { label: 'Paste', hint: '⌘V', onSelect: () => pasteElements() },
        { label: 'Duplicate', hint: '⌘D', onSelect: duplicateSelected, disabled: !has },
        { label: 'Delete', hint: '⌫', onSelect: deleteSelected, disabled: !has, danger: true },
        { type: 'sep' },
        { label: 'Bring forward', hint: '⌘]', onSelect: () => reorder('forward'), disabled: !has },
        { label: 'Bring to front', hint: '⌥⌘]', onSelect: () => reorder('front'), disabled: !has },
        { label: 'Send backward', hint: '⌘[', onSelect: () => reorder('backward'), disabled: !has },
        { label: 'Send to back', hint: '⌥⌘[', onSelect: () => reorder('back'), disabled: !has },
        { type: 'sep' },
        grouped
          ? { label: 'Ungroup', hint: '⇧⌘G', onSelect: ungroupSelection }
          : { label: 'Group', hint: '⌘G', onSelect: groupSelection, disabled: els.length < 2 },
        { label: els.every((e) => e.locked) && has ? 'Unlock' : 'Lock', onSelect: toggleLock, disabled: !has },
      ]
    : [{ label: 'Copy', onSelect: copySelection, disabled: !has }]
  return (
    <div ref={ref} data-overlay="popover" style={{ left: pos.x, top: pos.y }} className="fixed z-50 rounded-card border border-line bg-surface shadow-pop">
      <MenuList items={items} onClose={onClose} />
    </div>
  )
}
