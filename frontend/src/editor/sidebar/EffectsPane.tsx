import { singleLineWidth } from '@/render/text'
import Konva from 'konva'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ColorWell } from '@/components/ui/ColorPicker'
import { cx, Empty, SectionLabel, Slider } from '@/components/ui/kit'
import type { DesignElement, TextEffect, TextElement } from '@/doc/schema'
import { luminance } from '@/lib/color'
import { onAssetReady } from '@/render/assets'
import { buildElement } from '@/render/konva'
import { canEdit, useEditor } from '@/stores/editor'
import { updateSelected } from '../actions'
import { useSelected } from '../hooks'

type EffectType = TextEffect['type']

const EFFECTS: Array<{ type: EffectType; label: string }> = [
  { type: 'none', label: 'None' },
  { type: 'shadow', label: 'Shadow' },
  { type: 'lift', label: 'Lift' },
  { type: 'hollow', label: 'Hollow' },
  { type: 'outline', label: 'Outline' },
  { type: 'splice', label: 'Splice' },
  { type: 'echo', label: 'Echo' },
  { type: 'glitch', label: 'Glitch' },
  { type: 'neon', label: 'Neon' },
  { type: 'glow', label: 'Glow' },
  { type: 'background', label: 'Background' },
]

function defaults(type: EffectType, el: TextElement): TextEffect {
  const light = luminance(el.color) > 0.6
  switch (type) {
    case 'shadow': return { type, color: '#000000', blur: 30, offset: 30, angle: 45, opacity: 40 }
    case 'lift': return { type, intensity: 50 }
    case 'hollow': return { type, thickness: 50 }
    case 'outline': return { type, color: light ? '#16131f' : '#ffffff', thickness: 50 }
    case 'splice': return { type, color: '#ff9fd2', thickness: 50, offset: 30, angle: 45 }
    case 'echo': return { type, color: el.color, offset: 30, angle: 45 }
    case 'glitch': return { type, offset: 20, angle: 0, colorA: '#00e1ff', colorB: '#ff2bd6' }
    case 'neon': return { type, intensity: 50 }
    case 'glow': return { type, color: light ? '#612bd3' : '#f07a8a', blur: 50 }
    case 'background': return { type, color: light ? '#16131f' : '#f6e3a1', roundness: 40, spread: 40, opacity: 100 }
    default: return { type: 'none' }
  }
}

// Previews go through the real renderer so tiles look exactly like the canvas.
let previewStage: Konva.Stage | null = null

function previewUrl(sample: TextElement): string {
  if (!previewStage) {
    previewStage = new Konva.Stage({ container: document.createElement('div'), width: 10, height: 10 })
    previewStage.add(new Konva.Layer())
  }
  const layer = previewStage.getLayers()[0]
  layer.destroyChildren()
  const node = buildElement(sample)
  layer.add(node)
  const r = node.getClientRect({ relativeTo: layer })
  const pad = sample.fontSize * 0.15
  const url = layer.toDataURL({ x: r.x - pad, y: r.y - pad, width: r.width + pad * 2, height: r.height + pad * 2, pixelRatio: 1 })
  layer.destroyChildren()
  return url
}

function sampleText(el: TextElement): TextElement {
  const word = el.text.trim().split(/\s+/)[0]?.slice(0, 5) || 'Ag'
  const s: TextElement = {
    ...el, id: 'fx-preview', x: 0, y: 0, rotation: 0, opacity: 1, text: word, fontSize: 56, curve: undefined,
    list: 'none', shadow: undefined, anim: undefined, flipX: undefined, flipY: undefined, lineHeight: 1.1,
    letterSpacing: el.letterSpacing, align: 'center',
  }
  // measure rather than guess, so wide or all-caps fonts don't wrap in the tile
  s.width = Math.ceil(singleLineWidth(s) + 56 * 0.3)
  s.height = 56 * 1.25
  return s
}

function useAssetTick() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let t = 0
    const off = onAssetReady(() => {
      clearTimeout(t)
      t = window.setTimeout(() => setTick((n) => n + 1), 120)
    })
    return () => {
      clearTimeout(t)
      off()
    }
  }, [])
  return tick
}

function Tiles({ el, active }: { el: TextElement; active: EffectType }) {
  const tick = useAssetTick()
  const base = sampleText(el)
  const key = [base.text, base.fontFamily, base.fontWeight, base.italic, base.color, base.uppercase, JSON.stringify(base.gradient ?? null), tick].join('|')
  const urls = useMemo(
    () => EFFECTS.map((e) => previewUrl({ ...base, effect: e.type === active && el.effect ? el.effect : defaults(e.type, el) })),
    [key, active, JSON.stringify(el.effect ?? null)],
  )
  const dark = luminance(el.color) > 0.8
  return (
    <div className="grid grid-cols-3 gap-2">
      {EFFECTS.map((e, i) => (
        <button
          key={e.type}
          onClick={() => updateSelected((x) => (x.type === 'text' ? { effect: e.type === 'none' ? undefined : x.effect?.type === e.type ? x.effect : defaults(e.type, x) } : {}))}
          aria-pressed={active === e.type}
          className="flex flex-col items-center gap-1.5 group"
        >
          <span
            className={cx(
              'w-full aspect-square rounded-tile border flex items-center justify-center p-2 transition',
              active === e.type ? 'border-accent ring-2 ring-accent-line' : 'border-line group-hover:border-accent-line',
              dark ? 'bg-[#2a2733]' : 'bg-surface-2',
            )}
          >
            {e.type === 'none' && !el.text.trim() ? null : <img src={urls[i]} alt="" className="max-w-full max-h-full object-contain" draggable={false} />}
          </span>
          <span className={cx('text-[12px]', active === e.type ? 'text-accent font-medium' : 'text-ink-2')}>{e.label}</span>
        </button>
      ))}
    </div>
  )
}

function Controls({ fx }: { fx: TextEffect }) {
  const set = (patch: Partial<TextEffect>) =>
    updateSelected((x) => (x.type === 'text' && x.effect?.type === fx.type ? { effect: { ...x.effect, ...patch } as TextEffect } : {}))
  const slider = (label: string, key: string, min = 0, max = 100) => (
    <Slider key={key} label={label} value={(fx as unknown as Record<string, number>)[key] ?? 0} min={min} max={max} onChange={(v) => set({ [key]: v } as Partial<TextEffect>)} />
  )
  const color = (label: string, key: string) => (
    <div key={key} className="flex items-center justify-between text-[13px] text-ink-2">
      <span>{label}</span>
      <ColorWell value={(fx as unknown as Record<string, string>)[key]} onChange={(c) => set({ [key]: c as string } as Partial<TextEffect>)} label={label} />
    </div>
  )
  let rows: ReactNode[] = []
  switch (fx.type) {
    case 'shadow':
      rows = [slider('Offset', 'offset'), slider('Direction', 'angle', -180, 180), slider('Blur', 'blur'), slider('Transparency', 'opacity'), color('Color', 'color')]
      break
    case 'lift':
    case 'neon':
      rows = [slider('Intensity', 'intensity')]
      break
    case 'hollow':
      rows = [slider('Thickness', 'thickness')]
      break
    case 'outline':
      rows = [slider('Thickness', 'thickness'), color('Color', 'color')]
      break
    case 'splice':
      rows = [slider('Thickness', 'thickness'), slider('Offset', 'offset'), slider('Direction', 'angle', -180, 180), color('Color', 'color')]
      break
    case 'echo':
      rows = [slider('Offset', 'offset'), slider('Direction', 'angle', -180, 180), color('Color', 'color')]
      break
    case 'glitch':
      rows = [slider('Offset', 'offset'), slider('Direction', 'angle', -180, 180), color('First color', 'colorA'), color('Second color', 'colorB')]
      break
    case 'glow':
      rows = [slider('Size', 'blur'), color('Color', 'color')]
      break
    case 'background':
      rows = [slider('Roundness', 'roundness'), slider('Spread', 'spread'), slider('Transparency', 'opacity'), color('Color', 'color')]
      break
  }
  if (!rows.length) return null
  return <div className="flex flex-col gap-4 mt-4 p-3.5 rounded-control border border-line">{rows}</div>
}

function isText(el: DesignElement): el is TextElement {
  return el.type === 'text'
}

export default function EffectsPane() {
  const els = useSelected()
  const role = useEditor((s) => s.role)
  const texts = els.filter(isText)
  const el = texts[0]

  if (!canEdit(role)) return <Empty title="View only">You can look at effects, but this design is read-only for you.</Empty>
  if (!el) {
    return (
      <Empty title={els.length ? 'Effects are for text' : 'Select some text'}>
        {els.length
          ? 'Pick a text box to add shadows, outlines, neon and more. Photos have their own adjustments under Photo.'
          : 'Click a text box on the page, then pick an effect here. You can also curve the text.'}
      </Empty>
    )
  }

  const fx = el.effect ?? { type: 'none' as const }
  const curve = el.curve ?? 0
  return (
    <div className="flex flex-col">
      <SectionLabel>Style</SectionLabel>
      <Tiles el={el} active={fx.type} />
      <Controls fx={fx} />
      <SectionLabel>Shape</SectionLabel>
      <div className="flex gap-2 mb-3">
        {[{ v: 0, label: 'None' }, { v: 50, label: 'Curve' }].map((o) => (
          <button
            key={o.label}
            onClick={() => updateSelected((x) => (x.type === 'text' ? { curve: o.v || undefined } : {}))}
            className={cx(
              'flex-1 h-16 rounded-tile border flex flex-col items-center justify-center gap-1 text-[12px]',
              (o.v === 0) === (curve === 0) ? 'border-accent text-accent bg-accent-wash' : 'border-line text-ink-2 hover:border-accent-line',
            )}
          >
            <svg viewBox="0 0 60 20" className="w-12 h-4" aria-hidden>
              <path d={o.v ? 'M4 17 Q30 -5 56 17' : 'M4 12 H56'} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
            {o.label}
          </button>
        ))}
      </div>
      <Slider
        label="Curve"
        value={curve}
        min={-100}
        max={100}
        onChange={(v) => {
          const n = Math.max(-100, Math.min(100, Math.round(v) || 0))
          updateSelected((x) => (x.type === 'text' ? { curve: n || undefined } : {}))
        }}
      />
      {curve !== 0 && <p className="text-[12px] text-muted mt-2">Curved text stays on one line. Set the curve back to 0 to wrap it again.</p>}
    </div>
  )
}
