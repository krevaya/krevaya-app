import { NEW_SHAPE_TINT } from '@/doc/factory'
import { Icon } from '@/components/icons'
import { pickReplacement } from '@/features/photos/media'
import { useRef, useState, type ReactNode } from 'react'
import { Button, cx, GlyphButton, Slider } from '@/components/ui/kit'
import { ColorWell, fillCss } from '@/components/ui/ColorPicker'
import { MenuList, Flyout } from '@/components/ui/Flyout'
import type { DesignElement, Fill, ImageElement, LineElement, LineHead, ShapeElement, SvgElement, TextElement } from '@/doc/schema'
import { svgColors } from '@/render/assets'
import { SHAPES, shapePath } from '@/render/shapes'
import { canEdit, useEditor } from '@/stores/editor'
import {
  align, deleteSelected, duplicateSelected, flip, groupSelection, toggleLock, ungroupSelection, updateSelected,
} from './actions'
import { TypefaceMenu } from './TypefaceMenu'
import { usePage, useSelected } from './hooks'
import { weightsOf } from './fonts'
import { editorModals } from './modals'

function Sep() {
  return <span className="w-px h-6 bg-line mx-0.5 shrink-0" />
}

function Pop({ label, button, children, width = 260 }: { label: string; button: ReactNode; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen(!open)}
        title={label}
        aria-label={label}
        className={cx('h-8 px-2.5 rounded-lg text-[13px] flex items-center gap-1.5 shrink-0', open ? 'bg-accent-wash text-accent' : 'text-ink-2 hover:bg-hover')}
      >
        {button}
      </button>
      <Flyout anchor={ref.current} open={open} onClose={() => setOpen(false)}>
        <div style={{ width }} className="p-4 flex flex-col gap-4">{children}</div>
      </Flyout>
    </>
  )
}

function Transparency({ els }: { els: DesignElement[] }) {
  const v = Math.round((els[0]?.opacity ?? 1) * 100)
  return (
    <Pop label="Transparency" button={<span className="h-4 w-4 rounded-sm checker border border-line-2" />}>
      <Slider label="Transparency" value={v} min={0} max={100} onChange={(n) => updateSelected({ opacity: n / 100 })} />
    </Pop>
  )
}

function Shadow({ els }: { els: DesignElement[] }) {
  const s = els[0]?.shadow
  const set = (patch: Partial<NonNullable<DesignElement['shadow']>> | null) =>
    updateSelected({ shadow: patch === null ? undefined : { color: '#000000', blur: 20, x: 0, y: 8, opacity: 0.3, ...s, ...patch } })
  return (
    <Pop label="Shadow" button={<span className="text-[13px]">Shadow</span>}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium">Drop shadow</span>
        <button className="text-[12px] text-accent" onClick={() => set(s ? null : {})}>{s ? 'Remove' : 'Add'}</button>
      </div>
      {s && (
        <>
          <div className="flex items-center gap-2 text-[13px] text-ink-2">Color <ColorWell value={s.color} onChange={(c) => set({ color: c as string })} label="Shadow color" size="sm" /></div>
          <Slider label="Blur" value={s.blur} min={0} max={100} onChange={(n) => set({ blur: n })} />
          <Slider label="Offset X" value={s.x} min={-100} max={100} onChange={(n) => set({ x: n })} />
          <Slider label="Offset Y" value={s.y} min={-100} max={100} onChange={(n) => set({ y: n })} />
          <Slider label="Opacity" value={Math.round(s.opacity * 100)} min={0} max={100} onChange={(n) => set({ opacity: n / 100 })} />
        </>
      )}
    </Pop>
  )
}

function Common({ els }: { els: DesignElement[] }) {
  const locked = els.every((e) => e.locked)
  const more = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const s = useEditor.getState
  return (
    <>
      <Sep />
      <button className="h-8 px-2.5 rounded-lg text-[13px] text-ink-2 hover:bg-hover flex items-center gap-1.5" onClick={() => s().set({ panel: 'animate' })}>
        <Icon name="clapper" size={15} /> Animate
      </button>
      <button className="h-8 px-2.5 rounded-lg text-[13px] text-ink-2 hover:bg-hover" onClick={() => s().set({ panel: 'position' })}>Position</button>
      <Transparency els={els} />
      <GlyphButton label={locked ? 'Unlock' : 'Lock'} active={locked} onClick={toggleLock}>{locked ? <Icon name="lock" size={15} /> : <Icon name="unlock" size={15} />}</GlyphButton>
      <button ref={more} onClick={() => setOpen(!open)} aria-label="More" className="h-8 w-8 rounded-lg hover:bg-hover flex items-center justify-center text-ink-2"><Icon name="more" size={16} /></button>
      <Flyout anchor={more.current} open={open} onClose={() => setOpen(false)} place="bottom-end">
        <MenuList
          onClose={() => setOpen(false)}
          items={[
            { label: 'Duplicate', hint: '⌘D', onSelect: duplicateSelected },
            { label: 'Flip horizontal', onSelect: () => flip('x') },
            { label: 'Flip vertical', onSelect: () => flip('y') },
            { label: 'Slot name…', onSelect: () => editorModals.show('slot') },
            { label: 'Add link…', onSelect: () => editorModals.show('link') },
            { type: 'sep' },
            { label: 'Delete', hint: '⌫', danger: true, onSelect: deleteSelected },
          ]}
        />
      </Flyout>
    </>
  )
}

function TextTools({ el, els }: { el: TextElement; els: TextElement[] }) {
  const weights = weightsOf(el.fontFamily)
  const bold = el.fontWeight >= 600
  const nextAlign = { left: 'center', center: 'right', right: 'justify', justify: 'left' } as const
  const alignIcon = ({ left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify' } as const)[el.align]
  const setSize = (n: number) => updateSelected((e) => ({ fontSize: Math.max(4, Math.min(1600, Math.round(n * 10) / 10)) * ((e as TextElement).fontSize / el.fontSize) }))
  return (
    <>
      <TypefaceMenu value={el.fontFamily} onChange={(fontFamily) => updateSelected({ fontFamily })} />
      <div className="flex items-center h-8 rounded-lg border border-line-2">
        <button className="h-full w-7 hover:bg-hover rounded-l-lg" onClick={() => setSize(el.fontSize - 1)} aria-label="Smaller">−</button>
        <input
          className="w-12 h-full text-center text-[13px] tabular-nums bg-transparent outline-none"
          value={Math.round(el.fontSize * 10) / 10}
          onChange={(e) => Number(e.target.value) > 0 && setSize(Number(e.target.value))}
          aria-label="Font size"
        />
        <button className="h-full w-7 hover:bg-hover rounded-r-lg" onClick={() => setSize(el.fontSize + 1)} aria-label="Bigger">+</button>
      </div>
      <ColorWell
        value={el.gradient ?? el.color}
        gradients
        onChange={(v) => updateSelected(typeof v === 'string' ? { color: v, gradient: undefined } : v.type === 'solid' ? { color: v.color, gradient: undefined } : { gradient: v as Fill })}
        label="Text color"
      />
      <GlyphButton
        label="Bold"
        active={bold}
        onClick={() => {
          const target = bold ? weights.filter((w) => w <= 500).pop() ?? 400 : weights.find((w) => w >= 700) ?? 700
          updateSelected({ fontWeight: target })
        }}
      ><Icon name="bold" size={15} /></GlyphButton>
      <GlyphButton label="Italic" active={el.italic} onClick={() => updateSelected({ italic: !el.italic || undefined })}><Icon name="italic" size={15} /></GlyphButton>
      <GlyphButton label="Underline" active={el.underline} onClick={() => updateSelected({ underline: !el.underline || undefined })}><Icon name="underline" size={15} /></GlyphButton>
      <GlyphButton label="Strikethrough" active={el.strike} onClick={() => updateSelected({ strike: !el.strike || undefined })}><Icon name="strikethrough" size={15} /></GlyphButton>
      <GlyphButton label="Uppercase" active={el.uppercase} onClick={() => updateSelected({ uppercase: !el.uppercase || undefined })}><Icon name="text-format" size={15} /></GlyphButton>
      <GlyphButton label={`Align ${nextAlign[el.align]}`} onClick={() => updateSelected({ align: nextAlign[el.align] })}><Icon name={alignIcon} size={15} /></GlyphButton>
      <GlyphButton
        label="List"
        active={el.list === 'bullet' || el.list === 'number'}
        onClick={() => updateSelected({ list: el.list === 'bullet' ? 'number' : el.list === 'number' ? undefined : 'bullet' })}
      >
        {el.list === 'number' ? <Icon name="list-number" size={15} /> : <Icon name="list-bullet" size={15} />}
      </GlyphButton>
      <Pop label="Spacing" button={<span>Spacing</span>}>
        <Slider label="Letter spacing" value={el.letterSpacing} min={-200} max={800} onChange={(n) => updateSelected({ letterSpacing: n })} />
        <Slider label="Line height" value={el.lineHeight} min={0.5} max={2.5} step={0.05} onChange={(n) => updateSelected({ lineHeight: n })} />
        {weights.length > 2 && (
          <div>
            <p className="text-[13px] text-ink-2 mb-1.5">Weight</p>
            <div className="flex flex-wrap gap-1">
              {weights.map((w) => (
                <button key={w} onClick={() => updateSelected({ fontWeight: w })} className={cx('h-7 px-2 rounded-md text-[12px] border', w === el.fontWeight ? 'border-accent text-accent bg-accent-wash' : 'border-line')}>{w}</button>
              ))}
            </div>
          </div>
        )}
      </Pop>
      <button className="h-8 px-2.5 rounded-lg text-[13px] text-ink-2 hover:bg-hover flex items-center gap-1.5" onClick={() => useEditor.setState({ panel: 'effects' })}>
        <Icon name="sparkle" size={15} /> Effects
      </button>
      <Common els={els} />
    </>
  )
}

function ShapeTools({ el, els }: { el: ShapeElement; els: DesignElement[] }) {
  const sw = el.strokeWidth ?? 0
  return (
    <>
      <ColorWell value={el.fill} gradients onChange={(v) => updateSelected({ fill: typeof v === 'string' ? { type: 'solid', color: v } : v } as Partial<ShapeElement>)} label="Fill" />
      <Pop label="Border" button={<span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded border-2" style={{ borderColor: sw ? el.stroke : '#c4c4cc' }} />Border</span>}>
        <div className="flex gap-1">
          {(['none', 'solid', 'dashed', 'dotted'] as const).map((d) => (
            <button
              key={d}
              onClick={() => updateSelected(d === 'none' ? { strokeWidth: 0 } : { strokeDash: d, strokeWidth: sw || 4, stroke: el.stroke ?? '#16131f' } as Partial<ShapeElement>)}
              className={cx('flex-1 h-8 rounded-lg border text-[12px] capitalize', (d === 'none' ? !sw : sw && (el.strokeDash ?? 'solid') === d) ? 'border-accent text-accent bg-accent-wash' : 'border-line')}
            >
              {d}
            </button>
          ))}
        </div>
        {sw > 0 && (
          <>
            <div className="flex items-center gap-2 text-[13px] text-ink-2">Color <ColorWell value={el.stroke ?? '#16131f'} onChange={(c) => updateSelected({ stroke: c as string } as Partial<ShapeElement>)} label="Border color" size="sm" /></div>
            <Slider label="Weight" value={sw} min={1} max={60} onChange={(n) => updateSelected({ strokeWidth: n } as Partial<ShapeElement>)} />
          </>
        )}
        {(el.shape === 'rect' || el.shape === 'rounded') && (
          <Slider label="Corner rounding" value={el.radius ?? 0} min={0} max={Math.round(Math.min(el.width, el.height) / 2)} onChange={(n) => updateSelected({ radius: n } as Partial<ShapeElement>)} />
        )}
      </Pop>
      <Pop label="Change shape" button={<span>Shape</span>} width={300}>
        <div className="grid grid-cols-6 gap-1.5">
          {SHAPES.map((s) => (
            <button key={s.kind} title={s.label} onClick={() => updateSelected({ shape: s.kind } as Partial<ShapeElement>)} className={cx('h-10 rounded-lg border flex items-center justify-center', s.kind === el.shape ? 'border-accent bg-accent-wash' : 'border-line hover:bg-hover')}>
              <ShapeIcon kind={s.kind} />
            </button>
          ))}
        </div>
      </Pop>
      <Shadow els={els} />
      <Common els={els} />
    </>
  )
}

export function ShapeIcon({ kind, size = 22, color = NEW_SHAPE_TINT }: { kind: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <path d={shapePathFor(kind, size)} fill={color} fillRule="evenodd" />
    </svg>
  )
}

function shapePathFor(kind: string, size: number) {
  const wide = kind.startsWith('arrow-left') || kind.startsWith('arrow-right')
  return shapePath(kind, size, wide ? size * 0.7 : size, 0)
}

const MASKS = ['none', 'ellipse', 'heart', 'rounded', 'star', 'arch', 'speech', 'hexagon', 'blob', 'triangle', 'cloud', 'diamond'] as const

function ImageTools({ el, els }: { el: ImageElement; els: DesignElement[] }) {
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => useEditor.setState({ panel: 'filters' })}><Icon name="wand" size={15} />Edit photo</Button>
      <Button size="sm" variant="ghost" onClick={() => useEditor.setState({ cropId: el.id })}><Icon name="crop" size={15} />Crop</Button>
      {els.length === 1 && !el.locked && (
        <Button size="sm" variant="ghost" title="Swap in another photo from your computer" onClick={() => pickReplacement(el)}><Icon name="refresh" size={15} />Replace</Button>
      )}
      <GlyphButton label="Flip horizontal" onClick={() => flip('x')}><Icon name="flip" size={15} /></GlyphButton>
      <GlyphButton label="Flip vertical" onClick={() => flip('y')}><Icon name="flip-vertical" size={15} /></GlyphButton>
      <Pop label="Frame" button={<span>Frame</span>} width={280}>
        <div className="grid grid-cols-6 gap-1.5">
          {MASKS.map((m) => (
            <button key={m} title={m} onClick={() => updateSelected({ mask: m === 'none' ? undefined : m } as Partial<ImageElement>)} className={cx('h-10 rounded-lg border flex items-center justify-center', (el.mask ?? 'none') === m ? 'border-accent bg-accent-wash' : 'border-line hover:bg-hover')}>
              {m === 'none' ? <span className="text-[11px] text-muted">None</span> : <ShapeIcon kind={m} size={20} color="#9a9aa3" />}
            </button>
          ))}
        </div>
        <Slider label="Corner rounding" value={el.radius ?? 0} min={0} max={Math.round(Math.min(el.width, el.height) / 2)} onChange={(n) => updateSelected({ radius: n || undefined } as Partial<ImageElement>)} />
        <div className="flex items-center gap-2 text-[13px] text-ink-2">
          Border
          <ColorWell value={el.stroke ?? '#ffffff'} onChange={(c) => updateSelected({ stroke: c as string, strokeWidth: el.strokeWidth || 8 } as Partial<ImageElement>)} label="Border color" size="sm" />
        </div>
        <Slider label="Border weight" value={el.strokeWidth ?? 0} min={0} max={80} onChange={(n) => updateSelected({ strokeWidth: n || undefined, stroke: el.stroke ?? '#ffffff' } as Partial<ImageElement>)} />
      </Pop>
      <Shadow els={els} />
      <Common els={els} />
    </>
  )
}

function SvgTools({ el, els }: { el: SvgElement; els: DesignElement[] }) {
  const colors = el.kind === 'qr' ? [] : svgColors(el.svg)
  return (
    <>
      {el.kind === 'qr' && <Button size="sm" variant="ghost" onClick={() => editorModals.show('qr')}>Edit QR code</Button>}
      {colors.slice(0, 8).map((c) => (
        <ColorWell
          key={c}
          value={el.colors?.[c] ?? (c === 'currentColor' ? '#16131f' : c)}
          onChange={(v) => updateSelected({ colors: { ...el.colors, [c]: v as string } } as Partial<SvgElement>)}
          label="Graphic color"
          round
        />
      ))}
      <GlyphButton label="Flip horizontal" onClick={() => flip('x')}><Icon name="flip" size={15} /></GlyphButton>
      <GlyphButton label="Flip vertical" onClick={() => flip('y')}><Icon name="flip-vertical" size={15} /></GlyphButton>
      <Shadow els={els} />
      <Common els={els} />
    </>
  )
}

const HEADS: LineHead[] = ['none', 'arrow', 'triangle', 'circle', 'square', 'diamond', 'bar']

function LineTools({ el, els }: { el: LineElement; els: DesignElement[] }) {
  return (
    <>
      <ColorWell value={el.stroke} onChange={(c) => updateSelected({ stroke: c as string } as Partial<LineElement>)} label="Line color" />
      <Pop label="Line style" button={<span>Style</span>}>
        <div className="flex gap-1">
          {(['solid', 'dashed', 'dotted'] as const).map((d) => (
            <button key={d} onClick={() => updateSelected({ dash: d } as Partial<LineElement>)} className={cx('flex-1 h-8 rounded-lg border text-[12px] capitalize', (el.dash ?? 'solid') === d ? 'border-accent text-accent bg-accent-wash' : 'border-line')}>{d}</button>
          ))}
        </div>
        <Slider label="Weight" value={el.strokeWidth} min={1} max={80} onChange={(n) => updateSelected({ strokeWidth: n, height: Math.max(24, n * 6) } as Partial<LineElement>)} />
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!el.rounded} onChange={(e) => updateSelected({ rounded: e.target.checked || undefined } as Partial<LineElement>)} />Rounded ends</label>
      </Pop>
      {(['startHead', 'endHead'] as const).map((key) => (
        <Pop key={key} label={key === 'startHead' ? 'Line start' : 'Line end'} button={<span>{key === 'startHead' ? 'Start' : 'End'}</span>} width={220}>
          <div className="grid grid-cols-4 gap-1.5">
            {HEADS.map((h) => (
              <button key={h} onClick={() => updateSelected({ [key]: h } as Partial<LineElement>)} className={cx('h-9 rounded-lg border text-[11px] capitalize', el[key] === h ? 'border-accent text-accent bg-accent-wash' : 'border-line hover:bg-hover')}>{h}</button>
            ))}
          </div>
        </Pop>
      ))}
      <Common els={els} />
    </>
  )
}

function MultiTools({ els }: { els: DesignElement[] }) {
  const grouped = els.length > 1 && els.every((e) => e.groupId && e.groupId === els[0].groupId)
  return (
    <>
      <span className="text-[12px] text-accent bg-accent-wash border border-accent-line rounded-md px-2 h-6 flex items-center">{els.length} selected</span>
      {grouped ? (
        <Button size="sm" variant="ghost" onClick={ungroupSelection}><Icon name="ungroup" size={15} />Ungroup</Button>
      ) : (
        <Button size="sm" variant="ghost" onClick={groupSelection}><Icon name="group" size={15} />Group</Button>
      )}
      <Pop label="Align" button={<span>Align</span>} width={220}>
        <div className="grid grid-cols-3 gap-1.5">
          {(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map((a) => (
            <button key={a} onClick={() => align(a)} className="h-9 rounded-lg border border-line text-[12px] capitalize hover:bg-hover">{a}</button>
          ))}
        </div>
      </Pop>
      <Common els={els} />
    </>
  )
}

/** With nothing selected, the toolbar offers the page background. */
function PageTools() {
  const page = usePage()
  const panel = useEditor((s) => s.panel)
  if (!page) return null
  const bg = page.background
  return (
    <button
      onClick={() => useEditor.setState({ panel: 'background' })}
      className={cx('h-8 px-2.5 rounded-lg text-[13px] flex items-center gap-2', panel === 'background' ? 'bg-accent-wash text-accent' : 'text-ink-2 hover:bg-hover')}
    >
      <span className={cx('h-5 w-5 rounded-md border border-black/15', bg.type === 'image' && 'checker')} style={bg.type === 'image' ? undefined : { background: fillCss(bg) }} />
      Background
    </button>
  )
}

export function SelectionBar() {
  const els = useSelected()
  const role = useEditor((s) => s.role)
  const editing = useEditor((s) => s.editingId)
  const cropId = useEditor((s) => s.cropId)
  if (!canEdit(role) || cropId) return null
  if (!els.length) {
    return (
      <div className="absolute left-3 right-3 top-3 z-10 flex justify-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 h-12 px-2 rounded-control border border-line bg-surface shadow-card" role="toolbar" aria-label="Page tools">
          <PageTools />
        </div>
      </div>
    )
  }
  const first = els[0]
  const same = els.every((e) => e.type === first.type)
  let body: ReactNode
  if (els.length > 1 && !(same && first.type === 'text')) body = <MultiTools els={els} />
  else if (first.type === 'text') body = <TextTools el={first} els={els as TextElement[]} />
  else if (first.type === 'shape') body = <ShapeTools el={first} els={els} />
  else if (first.type === 'image') body = <ImageTools el={first} els={els} />
  else if (first.type === 'svg') body = <SvgTools el={first} els={els} />
  else if (first.type === 'line') body = <LineTools el={first} els={els} />
  return (
    <div className={cx('absolute left-3 right-3 top-3 z-10 flex justify-center pointer-events-none', editing && 'opacity-95')}>
      <div className="pointer-events-auto max-w-full overflow-x-auto scroll-thin flex items-center gap-1 h-12 px-2 rounded-control border border-line bg-surface shadow-card" role="toolbar" aria-label="Selection tools">
        {body}
      </div>
    </div>
  )
}
