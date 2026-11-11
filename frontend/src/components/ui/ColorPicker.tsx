import { useRef, useState } from 'react'
import type { Fill } from '@/doc/schema'
import { isHex, normalizeHex } from '@/lib/color'
import { useBrand } from '@/stores/brand'
import { useEditor } from '@/stores/editor'
import { cx, ChoiceRow } from './kit'
import { Flyout } from './Flyout'

// One row each: neutrals, violets and cools, warms and greens.
const DEFAULTS = [
  '#ffffff', '#f4f1ea', '#e4e1ea', '#a8a3b6', '#6e697d', '#3d3949', '#1b1824', '#000000',
  '#2d1b69', '#612bd3', '#b79aef', '#24365e', '#2f6fb8', '#9cc3e0', '#2a9d8f', '#a8dcd1',
  '#7a1f3d', '#d93a5b', '#f07a8a', '#d9622b', '#c98f1c', '#f6e3a1', '#5a9e3a', '#c9e3a6',
]

const GRADIENTS: Fill[] = [
  { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#612bd3' }, { offset: 1, color: '#f07a8a' }] },
  { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#2a9d8f' }, { offset: 1, color: '#f6e3a1' }] },
  { type: 'linear', angle: 180, stops: [{ offset: 0, color: '#d9622b' }, { offset: 1, color: '#7a1f3d' }] },
  { type: 'linear', angle: 45, stops: [{ offset: 0, color: '#24365e' }, { offset: 1, color: '#9cc3e0' }] },
  { type: 'radial', stops: [{ offset: 0, color: '#ffffff' }, { offset: 1, color: '#b79aef' }] },
  { type: 'linear', angle: 160, stops: [{ offset: 0, color: '#1b1824' }, { offset: 1, color: '#612bd3' }] },
]

export function fillCss(f: Fill | string | undefined): string {
  if (!f) return 'transparent'
  if (typeof f === 'string') return f
  if (f.type === 'solid') return f.color
  if (f.type === 'linear') return `linear-gradient(${f.angle}deg, ${f.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`
  if (f.type === 'radial') return `radial-gradient(circle, ${f.stops.map((s) => `${s.color} ${s.offset * 100}%`).join(', ')})`
  return `center / cover url(${f.src})`
}

const NONE: string[] = []

function colorsInUse(): string[] {
  const doc = useEditor.getState().doc
  if (!doc) return []
  const found = new Set<string>()
  for (const page of doc.getSnapshot().pages) {
    if (page.background.type === 'solid') found.add(page.background.color.toLowerCase())
    for (const el of page.elements) {
      if (el.type === 'text') found.add(el.color.toLowerCase())
      if (el.type === 'shape' && el.fill.type === 'solid') found.add(el.fill.color.toLowerCase())
      if (el.type === 'line') found.add(el.stroke.toLowerCase())
    }
  }
  return [...found].filter(isHex).slice(0, 18)
}

function Swatch({ color, active, onClick, label }: { color: string; active?: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      title={label ?? color}
      aria-label={label ?? color}
      className={cx('h-7 w-7 rounded-lg border transition hover:scale-105', active ? 'ring-2 ring-accent ring-offset-1 border-transparent' : 'border-black/10')}
      style={{ background: color }}
    />
  )
}

export function ColorPanel({ value, onChange, gradients = false }: {
  value: Fill | string
  onChange: (v: Fill | string) => void
  gradients?: boolean
}) {
  const current = typeof value === 'string' ? value : value.type === 'solid' ? value.color : ''
  const [hex, setHex] = useState(current)
  const [tab, setTab] = useState<'solid' | 'gradient'>(typeof value !== 'string' && (value.type === 'linear' || value.type === 'radial') ? 'gradient' : 'solid')
  const brand = useBrand((s) => s.active?.colors ?? NONE)
  const used = colorsInUse()
  const set = (c: string) => {
    setHex(c)
    onChange(typeof value === 'string' ? c : { type: 'solid', color: c })
  }
  const grad = typeof value !== 'string' && (value.type === 'linear' || value.type === 'radial') ? value : null

  return (
    <div className="w-[264px] p-3.5 flex flex-col gap-3">
      {gradients && (
        <ChoiceRow value={tab} onChange={setTab} options={[{ value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }]} />
      )}
      {tab === 'solid' ? (
        <>
          <div className="flex gap-2 items-center">
            <label className="relative h-9 w-9 rounded-lg border border-line-2 overflow-hidden shrink-0" style={{ background: current || '#fff' }}>
              <input type="color" value={isHex(current) ? normalizeHex(current) : '#000000'} onChange={(e) => set(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" aria-label="Pick a color" />
            </label>
            <input
              value={hex}
              onChange={(e) => {
                setHex(e.target.value)
                if (isHex(e.target.value)) set(normalizeHex(e.target.value))
              }}
              className="flex-1 h-9 rounded-lg border border-line-2 px-2.5 text-[13px] font-mono uppercase bg-surface"
              aria-label="Hex color"
            />
          </div>
          {used.length > 0 && <Group title="In this design" colors={used} current={current} onPick={set} />}
          {brand.length > 0 && <Group title="Brand colors" colors={brand} current={current} onPick={set} />}
          <Group title="Default colors" colors={DEFAULTS} current={current} onPick={set} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-6 gap-1.5">
            {GRADIENTS.map((g, i) => (
              <button key={i} onClick={() => onChange(g)} className="h-7 w-7 rounded-lg border border-black/10" style={{ background: fillCss(g) }} aria-label="Gradient preset" />
            ))}
          </div>
          {grad && (
            <div className="flex flex-col gap-2">
              {grad.stops.map((s, i) => (
                <label key={i} className="flex items-center gap-2 text-[12px] text-muted">
                  <input
                    type="color"
                    value={normalizeHex(s.color)}
                    onChange={(e) => onChange({ ...grad, stops: grad.stops.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)) })}
                    className="h-7 w-9 rounded border border-line-2"
                  />
                  {i === 0 ? 'Start' : 'End'}
                </label>
              ))}
              {grad.type === 'linear' && (
                <label className="flex items-center gap-2 text-[12px] text-muted">
                  Angle
                  <input type="range" min={0} max={360} value={grad.angle} onChange={(e) => onChange({ ...grad, angle: Number(e.target.value) })} className="flex-1" />
                </label>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Group({ title, colors, current, onPick }: { title: string; colors: string[]; current: string; onPick: (c: string) => void }) {
  return (
    <div>
      <p className="text-[11px] text-faint mb-1.5">{title}</p>
      <div className="grid grid-cols-8 gap-1.5">
        {colors.map((c) => (
          <Swatch key={c} color={c} active={c.toLowerCase() === current.toLowerCase()} onClick={() => onPick(c)} />
        ))}
      </div>
    </div>
  )
}

export function ColorWell({ value, onChange, label, gradients, size = 'md', round }: {
  value: Fill | string
  onChange: (v: Fill | string) => void
  label: string
  gradients?: boolean
  size?: 'sm' | 'md'
  round?: boolean
}) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen((o) => !o)}
        title={label}
        aria-label={label}
        className={cx('border border-black/15 shrink-0', size === 'sm' ? 'h-6 w-6' : 'h-8 w-8', round ? 'rounded-full' : 'rounded-lg')}
        style={{ background: fillCss(value) }}
      />
      <Flyout anchor={ref.current} open={open} onClose={() => setOpen(false)}>
        <ColorPanel value={value} onChange={onChange} gradients={gradients} />
      </Flyout>
    </>
  )
}
