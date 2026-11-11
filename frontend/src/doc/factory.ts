import type {
  DesignElement, ImageElement, LineElement, Page, ShapeElement, ShapeKind, SvgElement, SvgKind, TextElement,
} from './schema'
import { uid } from '@/lib/id'
import { measureTextHeight } from '@/render/text'

export function newPage(width: number, height: number, background = '#ffffff'): Page {
  return { id: uid(), width, height, background: { type: 'solid', color: background }, elements: [] }
}

function centered(page: Page, w: number, h: number) {
  return { x: Math.round((page.width - w) / 2), y: Math.round((page.height - h) / 2) }
}

const base = { rotation: 0, opacity: 1 }

/** Fill for new shapes when there's no brand color to use. */
export const NEW_SHAPE_TINT = '#2a9d8f'

export type TypeStyle = 'heading' | 'subheading' | 'body'

export function newText(page: Page, preset: TypeStyle = 'body', opts: Partial<TextElement> = {}): TextElement {
  const short = Math.min(page.width, page.height)
  const sizes = { heading: short * 0.085, subheading: short * 0.048, body: short * 0.03 }
  const weights = { heading: 800, subheading: 600, body: 400 }
  const copy = { heading: 'Your headline', subheading: 'A supporting line', body: 'Write a few words here' }
  const fontSize = Math.max(12, Math.round(sizes[preset]))
  const width = Math.round(Math.min(page.width * 0.8, fontSize * (preset === 'body' ? 18 : 12)))
  const el: TextElement = {
    ...base,
    id: uid(),
    type: 'text',
    x: 0,
    y: 0,
    width,
    height: fontSize * 1.2,
    text: copy[preset],
    fontFamily: 'Inter',
    fontSize,
    fontWeight: weights[preset],
    align: 'center',
    lineHeight: preset === 'body' ? 1.4 : 1.15,
    letterSpacing: 0,
    color: '#16131f',
    role: preset,
    ...opts,
  }
  el.height = measureTextHeight(el)
  return { ...el, ...centered(page, el.width, el.height), ...pick(opts, ['x', 'y']) }
}

function pick<T extends object>(o: T, keys: Array<keyof T>): Partial<T> {
  const out: Partial<T> = {}
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
  return out
}

export function newShape(page: Page, shape: ShapeKind, color = NEW_SHAPE_TINT): ShapeElement {
  const size = Math.round(Math.min(page.width, page.height) * 0.3)
  const tall = shape === 'arrow-up' || shape === 'arrow-down'
  const wide = shape.startsWith('arrow-') && !tall
  const w = wide ? size * 1.4 : size
  const h = tall ? size * 1.4 : wide ? size * 0.7 : size
  return {
    ...base, id: uid(), type: 'shape', shape, width: w, height: h, ...centered(page, w, h),
    fill: { type: 'solid', color },
  }
}

export function newLine(page: Page, opts: Partial<LineElement> = {}): LineElement {
  const width = Math.round(page.width * 0.4)
  const strokeWidth = Math.max(2, Math.round(Math.min(page.width, page.height) * 0.006))
  const height = Math.max(24, strokeWidth * 6)
  return {
    ...base, id: uid(), type: 'line', width, height, ...centered(page, width, height),
    stroke: '#16131f', strokeWidth, startHead: 'none', endHead: 'none', ...opts,
  }
}

export function newImage(page: Page, src: string, nw: number, nh: number, opts: Partial<ImageElement> = {}): ImageElement {
  const max = Math.min(page.width, page.height) * 0.6
  const scale = Math.min(1, max / Math.max(nw, nh)) || 1
  const w = Math.round(nw * scale)
  const h = Math.round(nh * scale)
  return {
    ...base, id: uid(), type: 'image', src, naturalWidth: nw, naturalHeight: nh,
    width: w, height: h, ...centered(page, w, h), ...opts,
  }
}

export function newSvg(page: Page, kind: SvgKind, svg: string, opts: Partial<SvgElement> = {}): SvgElement {
  const vb = /viewBox="([\d.\-\s]+)"/i.exec(svg)?.[1]?.trim().split(/\s+/).map(Number)
  const ratio = vb && vb[2] && vb[3] ? vb[2] / vb[3] : 1
  const size = Math.round(Math.min(page.width, page.height) * (kind === 'icon' || kind === 'emoji' ? 0.2 : 0.4))
  const w = ratio >= 1 ? size : Math.round(size * ratio)
  const h = ratio >= 1 ? Math.round(size / ratio) : size
  return { ...base, id: uid(), type: 'svg', kind, svg, width: w, height: h, ...centered(page, w, h), ...opts }
}

/** Fresh ids for pasted or duplicated elements, keeping groups together. */
export function cloneElements(els: DesignElement[], offset = 0): DesignElement[] {
  const groups = new Map<string, string>()
  return els.map((el) => {
    const copy = structuredClone(el)
    copy.id = uid()
    copy.x += offset
    copy.y += offset
    if (copy.groupId) {
      if (!groups.has(copy.groupId)) groups.set(copy.groupId, uid())
      copy.groupId = groups.get(copy.groupId)
    }
    return copy
  })
}
