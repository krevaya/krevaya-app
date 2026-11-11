import Konva from 'konva'
import type {
  DesignElement, Fill, ImageElement, LineElement, LineHead, Page, ShapeElement, SvgElement, TextElement,
} from '@/doc/schema'
import { withAlpha } from '@/lib/color'
import { rad } from '@/lib/math'
import { ensureFont, imageNow, svgImageNow } from './assets'
import { filteredImage, hasFilters } from './filters'
import { shapePath } from './shapes'
import { baseTextAttrs, curvePath } from './text'

// One renderer for everything: the editor canvas, thumbnails, PNG/PDF export,
// present mode and video frames all build Konva nodes through here.

/** How an animation changes an element at one moment. */
export type MotionState = {
  opacity?: number
  dx?: number
  dy?: number
  scaleX?: number
  scaleY?: number
  rotation?: number
  blur?: number
  /** Visible fraction of the element, for wipes: [x0, y0, x1, y1] in 0..1. */
  clip?: [number, number, number, number]
}

export type RenderCtx = {
  /** Pixel ratio things get cached at (filters, effects). */
  pixelRatio?: number
  /** Element being edited as text: hide it so the editor's textarea shows instead. */
  editingId?: string | null
  /** Show hidden elements faintly (the editor does, exports don't). */
  showHidden?: boolean
  motion?: (el: DesignElement) => MotionState | null
}

export function fillAttrs(fill: Fill | undefined, w: number, h: number): Record<string, unknown> {
  if (!fill) return { fill: undefined }
  switch (fill.type) {
    case 'solid':
      return { fill: fill.color }
    case 'linear': {
      const a = rad(fill.angle - 90)
      const len = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))
      const cx = w / 2
      const cy = h / 2
      const dx = (Math.cos(a) * len) / 2
      const dy = (Math.sin(a) * len) / 2
      return {
        fill: undefined,
        fillPriority: 'linear-gradient',
        fillLinearGradientStartPoint: { x: cx - dx, y: cy - dy },
        fillLinearGradientEndPoint: { x: cx + dx, y: cy + dy },
        fillLinearGradientColorStops: fill.stops.flatMap((s) => [s.offset, s.color]),
      }
    }
    case 'radial':
      return {
        fill: undefined,
        fillPriority: 'radial-gradient',
        fillRadialGradientStartPoint: { x: w / 2, y: h / 2 },
        fillRadialGradientEndPoint: { x: w / 2, y: h / 2 },
        fillRadialGradientStartRadius: 0,
        fillRadialGradientEndRadius: Math.hypot(w, h) / 2,
        fillRadialGradientColorStops: fill.stops.flatMap((s) => [s.offset, s.color]),
      }
    case 'image':
      return { fill: '#e5e5ea' }
  }
}

function coverCrop(iw: number, ih: number, w: number, h: number) {
  const scale = Math.max(w / iw, h / ih)
  const cw = w / scale
  const ch = h / scale
  return { x: (iw - cw) / 2, y: (ih - ch) / 2, width: cw, height: ch }
}

export function defaultCrop(el: Pick<ImageElement, 'naturalWidth' | 'naturalHeight' | 'width' | 'height'>) {
  return coverCrop(el.naturalWidth || el.width, el.naturalHeight || el.height, el.width, el.height)
}

function dashFor(kind: string | undefined, width: number): number[] | undefined {
  if (kind === 'dashed') return [width * 3, width * 2]
  if (kind === 'dotted') return [0.01, width * 2]
  return undefined
}

// Backgrounds

export function backgroundNode(page: Page): Konva.Shape {
  const bg = page.background ?? { type: 'solid', color: '#ffffff' }
  if (bg.type === 'image') {
    const img = imageNow(bg.src)
    if (img) {
      const crop = coverCrop(img.naturalWidth, img.naturalHeight, page.width, page.height)
      return new Konva.Image({ image: img, width: page.width, height: page.height, crop, listening: false, name: 'background' })
    }
  }
  return new Konva.Rect({ width: page.width, height: page.height, listening: false, name: 'background', ...fillAttrs(bg, page.width, page.height) })
}

// Elements

function textNode(el: TextElement, w: number, extra: Record<string, unknown>): Konva.Shape {
  const attrs = baseTextAttrs(el)
  if (el.curve) {
    return new Konva.TextPath({
      ...attrs,
      text: attrs.text.replace(/\n/g, ' '),
      data: curvePath(el, w, el.height),
      align: 'center',
      textBaseline: 'alphabetic',
      ...extra,
    } as Konva.TextPathConfig)
  }
  return new Konva.Text({ ...attrs, width: w, ...extra })
}

function textFill(el: TextElement): Record<string, unknown> {
  if (el.gradient && el.gradient.type !== 'solid' && el.gradient.type !== 'image') {
    return fillAttrs(el.gradient, el.width, el.height)
  }
  return { fill: el.color }
}

function polar(offset: number, angle: number, size: number) {
  const d = (offset / 100) * size * 0.25
  return { x: Math.cos(rad(angle)) * d, y: Math.sin(rad(angle)) * d }
}

function buildText(group: Konva.Group, el: TextElement) {
  void ensureFont(el.fontFamily, el.fontWeight, el.italic)
  const w = el.width
  const fs = el.fontSize
  const fx = el.effect ?? { type: 'none' }
  const main = () => textNode(el, w, textFill(el))

  switch (fx.type) {
    case 'shadow': {
      const o = polar(fx.offset, fx.angle, fs)
      const t = main()
      t.setAttrs({ shadowColor: fx.color, shadowBlur: (fx.blur / 100) * fs * 0.5, shadowOffset: o, shadowOpacity: fx.opacity / 100 })
      group.add(t)
      return
    }
    case 'lift': {
      const t = main()
      t.setAttrs({ shadowColor: '#000', shadowBlur: fs * 0.25 * (0.4 + fx.intensity / 100), shadowOffset: { x: 0, y: fs * 0.05 }, shadowOpacity: 0.15 + (fx.intensity / 100) * 0.35 })
      group.add(t)
      return
    }
    case 'hollow':
      group.add(textNode(el, w, { fill: 'transparent', stroke: el.color, strokeWidth: Math.max(1, (fx.thickness / 100) * fs * 0.08) }))
      return
    case 'outline':
      group.add(textNode(el, w, { ...textFill(el), stroke: fx.color, strokeWidth: Math.max(1, (fx.thickness / 100) * fs * 0.12), fillAfterStrokeEnabled: true, lineJoin: 'round' }))
      return
    case 'splice': {
      const o = polar(fx.offset, fx.angle, fs)
      group.add(textNode(el, w, { fill: fx.color, x: o.x, y: o.y }))
      group.add(textNode(el, w, { fill: 'transparent', stroke: el.color, strokeWidth: Math.max(1, (fx.thickness / 100) * fs * 0.08) }))
      return
    }
    case 'echo': {
      const o = polar(fx.offset, fx.angle, fs)
      group.add(textNode(el, w, { fill: fx.color, opacity: 0.25, x: o.x * 2, y: o.y * 2 }))
      group.add(textNode(el, w, { fill: fx.color, opacity: 0.5, x: o.x, y: o.y }))
      group.add(main())
      return
    }
    case 'glitch': {
      const o = polar(fx.offset, fx.angle, fs)
      group.add(textNode(el, w, { fill: fx.colorA, x: -o.x, y: -o.y }))
      group.add(textNode(el, w, { fill: fx.colorB, x: o.x, y: o.y }))
      group.add(main())
      return
    }
    case 'neon': {
      const blur = fs * (0.15 + (fx.intensity / 100) * 0.5)
      group.add(textNode(el, w, { fill: el.color, shadowColor: el.color, shadowBlur: blur * 1.6, shadowOpacity: 1 }))
      group.add(textNode(el, w, { fill: '#ffffff', opacity: 0.85, shadowColor: el.color, shadowBlur: blur * 0.5, shadowOpacity: 1 }))
      return
    }
    case 'glow': {
      const t = main()
      t.setAttrs({ shadowColor: fx.color, shadowBlur: (fx.blur / 100) * fs * 0.8, shadowOpacity: 1 })
      group.add(t)
      return
    }
    case 'background': {
      const t = main()
      const pad = (fx.spread / 100) * fs * 0.6
      group.add(new Konva.Rect({
        x: -pad, y: -pad * 0.6, width: w + pad * 2, height: el.height + pad * 1.2,
        fill: fx.color, opacity: fx.opacity / 100, cornerRadius: (fx.roundness / 100) * fs * 0.8,
      }))
      group.add(t)
      return
    }
    default:
      group.add(main())
  }
}

function buildShape(group: Konva.Group, el: ShapeElement) {
  const sw = el.strokeWidth ?? 0
  group.add(new Konva.Path({
    data: shapePath(el.shape, el.width, el.height, el.radius ?? 0),
    ...fillAttrs(el.fill, el.width, el.height),
    stroke: sw > 0 ? el.stroke ?? '#000000' : undefined,
    strokeWidth: sw,
    dash: dashFor(el.strokeDash, sw),
    lineJoin: 'round',
    strokeScaleEnabled: false,
    fillRule: el.shape === 'ring' ? 'evenodd' : 'nonzero',
  }))
}

function headNode(kind: LineHead, x: number, dir: 1 | -1, el: LineElement): Konva.Shape | null {
  const s = Math.max(6, el.strokeWidth * 3)
  const common = { fill: el.stroke, stroke: el.stroke, strokeWidth: el.strokeWidth, lineJoin: 'round' as const, lineCap: 'round' as const }
  switch (kind) {
    case 'arrow':
      return new Konva.Line({ points: [x - dir * s, -s * 0.7, x, 0, x - dir * s, s * 0.7], ...common, fill: undefined })
    case 'triangle':
      return new Konva.Line({ points: [x - dir * s * 1.2, -s * 0.6, x, 0, x - dir * s * 1.2, s * 0.6], closed: true, ...common, strokeWidth: 1 })
    case 'circle':
      return new Konva.Circle({ x: x - dir * s * 0.5, y: 0, radius: s * 0.5, ...common, strokeWidth: 0 })
    case 'square':
      return new Konva.Rect({ x: x - (dir > 0 ? s : 0), y: -s / 2, width: s, height: s, ...common, strokeWidth: 0 })
    case 'diamond':
      return new Konva.Line({ points: [x, 0, x - dir * s * 0.6, -s * 0.6, x - dir * s * 1.2, 0, x - dir * s * 0.6, s * 0.6], closed: true, ...common, strokeWidth: 0 })
    case 'bar':
      return new Konva.Line({ points: [x, -s * 0.7, x, s * 0.7], ...common })
    default:
      return null
  }
}

/** How far the line body stops short of a head so the head isn't drawn over a thick line end. */
function headInset(kind: LineHead, el: LineElement) {
  const s = Math.max(6, el.strokeWidth * 3)
  if (kind === 'triangle') return s * 1.1
  if (kind === 'circle' || kind === 'square' || kind === 'diamond') return s * 0.6
  return 0
}

function buildLine(group: Konva.Group, el: LineElement) {
  const y = el.height / 2
  const inner = new Konva.Group({ y })
  const a = headInset(el.startHead, el)
  const b = headInset(el.endHead, el)
  inner.add(new Konva.Line({
    points: [a, 0, el.width - b, 0],
    stroke: el.stroke,
    strokeWidth: el.strokeWidth,
    dash: dashFor(el.dash, el.strokeWidth),
    lineCap: el.rounded || el.dash === 'dotted' ? 'round' : 'butt',
  }))
  const h1 = headNode(el.startHead, 0, -1, el)
  const h2 = headNode(el.endHead, el.width, 1, el)
  if (h1) inner.add(h1)
  if (h2) inner.add(h2)
  // An invisible wide band so thin lines are easy to click.
  group.add(new Konva.Rect({ width: el.width, height: el.height, fill: 'transparent' }))
  group.add(inner)
}

function maskClip(kind: string | undefined, radius: number | undefined, w: number, h: number) {
  if ((!kind || kind === 'none' || kind === 'rect') && !radius) return undefined
  const path = new Path2D(shapePath(kind && kind !== 'none' ? kind : 'rect', w, h, radius ?? 0))
  return () => [path] as [Path2D]
}

function buildImage(group: Konva.Group, el: ImageElement, ctx: RenderCtx) {
  const w = el.width
  const h = el.height
  const holder = new Konva.Group({ clipFunc: maskClip(el.mask, el.radius, w, h) as never })
  const img = imageNow(el.src)
  if (!img) {
    holder.add(new Konva.Rect({ width: w, height: h, fill: el.placeholder ? '#ece9f6' : '#f0f0f3' }))
  } else {
    const crop = el.crop ?? defaultCrop({ ...el, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight })
    if (hasFilters(el.filters)) {
      const pr = Math.min(4, ctx.pixelRatio ?? 1)
      holder.add(new Konva.Image({ image: filteredImage(img, el.src, crop, w, h, el.filters!, pr), width: w, height: h }))
    } else {
      holder.add(new Konva.Image({ image: img, width: w, height: h, crop }))
    }
  }
  group.add(holder)
  if (el.strokeWidth && el.stroke) {
    group.add(new Konva.Path({
      data: shapePath(el.mask && el.mask !== 'none' ? el.mask : 'rect', w, h, el.radius ?? 0),
      stroke: el.stroke, strokeWidth: el.strokeWidth, fillEnabled: false, strokeScaleEnabled: false,
    }))
  }
}

function buildSvg(group: Konva.Group, el: SvgElement, ctx: RenderCtx) {
  // Rasterize at the output scale so exports stay sharp; fall back to 1x while that loads.
  const pr = Math.min(4, ctx.pixelRatio ?? 1)
  const img = (pr > 1 && svgImageNow(el.svg, el.colors, el.width * pr, el.height * pr)) || svgImageNow(el.svg, el.colors, el.width, el.height)
  if (img) group.add(new Konva.Image({ image: img, width: el.width, height: el.height }))
  else group.add(new Konva.Rect({ width: el.width, height: el.height, fill: 'transparent' }))
}

function applyShadow(group: Konva.Group, el: DesignElement) {
  if (!el.shadow || el.type === 'text') return
  const s = el.shadow
  for (const child of group.getChildren()) {
    if (child instanceof Konva.Shape) {
      child.setAttrs({ shadowColor: withAlpha(s.color, 1), shadowBlur: s.blur, shadowOffset: { x: s.x, y: s.y }, shadowOpacity: s.opacity })
    } else if (child instanceof Konva.Group) {
      applyShadow(child, el)
    }
  }
}

function fillContent(content: Konva.Group, el: DesignElement, ctx: RenderCtx) {
  switch (el.type) {
    case 'text':
      buildText(content, el)
      break
    case 'shape':
      buildShape(content, el)
      break
    case 'line':
      buildLine(content, el)
      break
    case 'image':
      buildImage(content, el, ctx)
      break
    case 'svg':
      buildSvg(content, el, ctx)
      break
  }
  applyShadow(content, el)
}

/**
 * Element node layout:
 *   outer   (id, x, y, rotation, opacity)  <- what the transformer grabs
 *     motion  (centered, for animation scale/offset/clip)
 *       flip    (mirrors around the center)
 *         content
 */
export function buildElement(el: DesignElement, ctx: RenderCtx = {}): Konva.Group {
  const outer = new Konva.Group({ id: el.id, name: 'element' })
  syncElement(outer, el, ctx)
  return outer
}

export function syncElement(outer: Konva.Group, el: DesignElement, ctx: RenderCtx = {}) {
  outer.destroyChildren()
  const w = el.width
  const h = el.height
  const m = ctx.motion?.(el) ?? null
  const hiddenInEditor = el.hidden && ctx.showHidden
  outer.setAttrs({
    x: el.x,
    y: el.y,
    width: w,
    height: h,
    rotation: el.rotation || 0,
    opacity: (el.opacity ?? 1) * (hiddenInEditor ? 0.25 : 1),
    visible: (!el.hidden || ctx.showHidden) && ctx.editingId !== el.id,
    globalCompositeOperation: (el.blend as GlobalCompositeOperation) || 'source-over',
    draggable: false,
  })
  outer.setAttr('elType', el.type)
  const motion = new Konva.Group({
    x: w / 2 + (m?.dx ?? 0),
    y: h / 2 + (m?.dy ?? 0),
    offsetX: w / 2,
    offsetY: h / 2,
    scaleX: m?.scaleX ?? 1,
    scaleY: m?.scaleY ?? 1,
    rotation: m?.rotation ?? 0,
    opacity: m?.opacity ?? 1,
  })
  if (m?.clip) {
    const [x0, y0, x1, y1] = m.clip
    motion.clip({ x: x0 * w, y: y0 * h, width: (x1 - x0) * w, height: (y1 - y0) * h })
  }
  const flip = new Konva.Group({
    x: el.flipX ? w : 0,
    y: el.flipY ? h : 0,
    scaleX: el.flipX ? -1 : 1,
    scaleY: el.flipY ? -1 : 1,
  })
  const content = new Konva.Group()
  fillContent(content, el, ctx)
  flip.add(content)
  motion.add(flip)
  outer.add(motion)
  if (m?.blur) {
    motion.cache({ pixelRatio: ctx.pixelRatio ?? 1, offset: m.blur * 2 })
    motion.filters([Konva.Filters.Blur])
    motion.blurRadius(m.blur)
  }
}

/** Build a whole page into a fresh group, e.g. for export. */
export function buildPage(page: Page, ctx: RenderCtx = {}): Konva.Group {
  const g = new Konva.Group({ clip: { x: 0, y: 0, width: page.width, height: page.height } })
  g.add(backgroundNode(page))
  for (const el of page.elements) {
    if (el.hidden && !ctx.showHidden) continue
    g.add(buildElement(el, ctx))
  }
  return g
}

/** Every image a page needs, so exports can wait for them before drawing. */
export function pageImageSources(page: Page): string[] {
  const out: string[] = []
  if (page.background?.type === 'image') out.push(page.background.src)
  for (const el of page.elements) if (el.type === 'image' && el.src) out.push(el.src)
  return out
}
