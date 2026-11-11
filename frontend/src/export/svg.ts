import Konva from 'konva'
import type {
  DesignElement, Fill, ImageElement, LineElement, LineHead, Page, ShapeElement, SvgElement, TextElement,
} from '@/doc/schema'
import { rgbToHex } from '@/lib/color'
import { clamp, rad } from '@/lib/math'
import { knownFonts, loadImage, recolorSvg, svgDataUrl, type FontFile } from '@/render/assets'
import { filterAttrs, hasFilters } from '@/render/filters'
import { defaultCrop } from '@/render/konva'
import { shapePath } from '@/render/shapes'
import { baseTextAttrs, curvePath } from '@/render/text'
import { preparePage } from './raster'

// Standalone SVG from the document model. Mirrors what render/konva.ts draws, so
// keep the two in step when the renderer changes. Photos and fonts are embedded
// as data URLs, so the file looks the same wherever it's opened.

export type SvgOptions = { transparent?: boolean; embedFonts?: boolean }

const num = (v: number) => String(Math.round(v * 1000) / 1000)

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function colorParts(c: string | undefined): { c: string; a: number } {
  if (!c || c === 'transparent' || c === 'none') return { c: 'none', a: 0 }
  const m = c.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/i)
  if (m) {
    const a = m[4] ? (m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4])) : 1
    return { c: rgbToHex(+m[1], +m[2], +m[3]), a }
  }
  const h8 = c.match(/^#([0-9a-f]{6})([0-9a-f]{2})$/i)
  if (h8) return { c: '#' + h8[1], a: parseInt(h8[2], 16) / 255 }
  const h4 = c.match(/^#([0-9a-f]{3})([0-9a-f])$/i)
  if (h4) return { c: '#' + h4[1], a: parseInt(h4[2] + h4[2], 16) / 255 }
  return { c, a: 1 }
}

function paint(kind: 'fill' | 'stroke', c: string | undefined): string {
  const p = colorParts(c)
  if (p.c === 'none' || p.a === 0) return `${kind}="none"`
  return `${kind}="${esc(p.c)}"${p.a < 1 ? ` ${kind}-opacity="${num(p.a)}"` : ''}`
}

function dashFor(kind: string | undefined, width: number): string {
  if (kind === 'dashed') return ` stroke-dasharray="${num(width * 3)} ${num(width * 2)}"`
  if (kind === 'dotted') return ` stroke-dasharray="0.01 ${num(width * 2)}"`
  return ''
}

const blobToDataUrl = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })

const dataUrlCache = new Map<string, Promise<string>>()

/** The original file bytes as a data URL; falls back to re-encoding through a canvas. */
function imageDataUrl(img: HTMLImageElement): Promise<string> {
  const src = img.currentSrc || img.src
  if (src.startsWith('data:')) return Promise.resolve(src)
  let p = dataUrlCache.get(src)
  if (!p) {
    p = fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.blob()
      })
      .then(blobToDataUrl)
      .catch(() => {
        const c = document.createElement('canvas')
        c.width = img.naturalWidth
        c.height = img.naturalHeight
        c.getContext('2d')!.drawImage(img, 0, 0)
        return c.toDataURL('image/png')
      })
    dataUrlCache.set(src, p)
  }
  return p
}

function nearestFile(files: FontFile[], weight: number, italic: boolean): FontFile | undefined {
  const style = italic ? 'italic' : 'normal'
  const pool = files.filter((f) => f.style === style)
  const list = pool.length ? pool : files
  return [...list].sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0]
}

function fontFormat(url: string) {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase()
  if (ext === 'woff2') return 'woff2'
  if (ext === 'woff') return 'woff'
  if (ext === 'otf') return 'opentype'
  return 'truetype'
}

class SvgWriter {
  defs: string[] = []
  private seq = 0
  /** family -> url -> {style, weights} */
  fonts = new Map<string, { family: string; url: string; style: string; weights: number[] }>()

  constructor(private prefix: string) {}

  id(kind: string) {
    this.seq += 1
    return `${this.prefix}${kind}${this.seq}`
  }

  useFont(family: string, weight: number, italic: boolean) {
    const info = knownFonts().find((f) => f.family === family)
    const file = info && nearestFile(info.files, weight, italic)
    if (!file) return
    const key = `${family}|${file.url}|${file.style}`
    const hit = this.fonts.get(key)
    if (hit) hit.weights.push(weight)
    else this.fonts.set(key, { family, url: file.url, style: file.style, weights: [weight] })
  }

  async fontCss(): Promise<string> {
    const out: string[] = []
    for (const f of this.fonts.values()) {
      try {
        const res = await fetch(f.url)
        if (!res.ok) continue
        const data = await blobToDataUrl(await res.blob())
        const b64 = data.slice(data.indexOf(',') + 1)
        const mime = `font/${fontFormat(f.url) === 'opentype' ? 'otf' : fontFormat(f.url) === 'truetype' ? 'ttf' : fontFormat(f.url)}`
        const lo = Math.min(...f.weights)
        const hi = Math.max(...f.weights)
        out.push(
          `@font-face{font-family:"${f.family.replace(/"/g, '')}";src:url(data:${mime};base64,${b64}) format("${fontFormat(f.url)}");` +
            `font-weight:${lo === hi ? lo : `${lo} ${hi}`};font-style:${f.style}}`,
        )
      } catch {
        // missing font file: viewers fall back to the next family in the stack
      }
    }
    return out.join('\n')
  }

  /** A fill attribute for a document Fill in a w x h box (same geometry as fillAttrs in konva.ts). */
  fill(fill: Fill | undefined, w: number, h: number): string {
    if (!fill) return 'fill="none"'
    switch (fill.type) {
      case 'solid':
        return paint('fill', fill.color)
      case 'linear':
      case 'radial':
        return `fill="url(#${this.gradient(fill, w, h)})"`
      case 'image':
        return 'fill="#e5e5ea"'
    }
  }

  gradient(fill: Extract<Fill, { type: 'linear' | 'radial' }>, w: number, h: number): string {
    const id = this.id('g')
    const stops = fill.stops
      .map((s) => {
        const p = colorParts(s.color)
        return `<stop offset="${num(clamp(s.offset, 0, 1))}" stop-color="${esc(p.c === 'none' ? '#000000' : p.c)}"${p.a < 1 ? ` stop-opacity="${num(p.a)}"` : ''}/>`
      })
      .join('')
    if (fill.type === 'linear') {
      const a = rad(fill.angle - 90)
      const len = Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))
      const dx = (Math.cos(a) * len) / 2
      const dy = (Math.sin(a) * len) / 2
      this.defs.push(
        `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${num(w / 2 - dx)}" y1="${num(h / 2 - dy)}" x2="${num(w / 2 + dx)}" y2="${num(h / 2 + dy)}">${stops}</linearGradient>`,
      )
    } else {
      this.defs.push(
        `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${num(w / 2)}" cy="${num(h / 2)}" r="${num(Math.hypot(w, h) / 2)}">${stops}</radialGradient>`,
      )
    }
    return id
  }

  /**
   * A drop shadow / glow filter. Canvas shadowBlur is about twice the gaussian
   * deviation, hence blur / 2. The region is in user space around the w x h box
   * so big blurs on small elements don't get cut off.
   */
  shadow(o: { color: string; blur: number; dx: number; dy: number; opacity: number }, w: number, h: number): string {
    const id = this.id('f')
    const sd = Math.max(0, o.blur / 2)
    const pad = sd * 3 + Math.max(Math.abs(o.dx), Math.abs(o.dy)) + 2
    const p = colorParts(o.color)
    const alpha = clamp((p.c === 'none' ? 0 : p.a) * o.opacity, 0, 1)
    this.defs.push(
      `<filter id="${id}" filterUnits="userSpaceOnUse" x="${num(-pad)}" y="${num(-pad)}" width="${num(w + pad * 2)}" height="${num(h + pad * 2)}" color-interpolation-filters="sRGB">` +
        `<feGaussianBlur in="SourceAlpha" stdDeviation="${num(sd)}"/>` +
        `<feOffset dx="${num(o.dx)}" dy="${num(o.dy)}" result="b"/>` +
        `<feFlood flood-color="${esc(p.c === 'none' ? '#000000' : p.c)}" flood-opacity="${num(alpha)}"/>` +
        `<feComposite in2="b" operator="in"/>` +
        `<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`,
    )
    return id
  }

  clip(d: string, rule = 'nonzero'): string {
    const id = this.id('c')
    this.defs.push(`<clipPath id="${id}"><path d="${d}" clip-rule="${rule}"/></clipPath>`)
    return id
  }

  // Backgrounds

  async background(page: Page): Promise<string> {
    const bg = page.background ?? { type: 'solid', color: '#ffffff' }
    if (bg.type === 'image') {
      const img = await loadImage(bg.src).catch(() => null)
      if (img) {
        // konva.ts always covers the page, whatever `fit` says
        const href = await imageDataUrl(img)
        return `<image width="${num(page.width)}" height="${num(page.height)}" preserveAspectRatio="xMidYMid slice" xlink:href="${href}"/>`
      }
    }
    return `<rect width="${num(page.width)}" height="${num(page.height)}" ${this.fill(bg, page.width, page.height)}/>`
  }

  // Elements

  async element(el: DesignElement): Promise<string> {
    let body: string
    switch (el.type) {
      case 'text':
        body = this.text(el)
        break
      case 'shape':
        body = this.shape(el)
        break
      case 'line':
        body = this.line(el)
        break
      case 'image':
        body = await this.image(el)
        break
      case 'svg':
        body = this.svg(el)
        break
      default:
        return ''
    }
    const w = el.width
    const h = el.height
    if (el.shadow && el.type !== 'text') {
      const s = el.shadow
      const f = this.shadow({ color: colorParts(s.color).c, blur: s.blur, dx: s.x, dy: s.y, opacity: s.opacity }, w, h)
      body = `<g filter="url(#${f})">${body}</g>`
    }
    if (el.flipX || el.flipY) {
      body = `<g transform="translate(${num(el.flipX ? w : 0)} ${num(el.flipY ? h : 0)}) scale(${el.flipX ? -1 : 1} ${el.flipY ? -1 : 1})">${body}</g>`
    }
    const t = `translate(${num(el.x)} ${num(el.y)})${el.rotation ? ` rotate(${num(el.rotation)})` : ''}`
    const op = (el.opacity ?? 1) < 1 ? ` opacity="${num(el.opacity)}"` : ''
    const blend = el.blend && el.blend !== 'source-over' && el.blend !== 'normal' ? ` style="mix-blend-mode:${esc(el.blend)}"` : ''
    const name = el.name ? ` data-name="${esc(el.name)}"` : ''
    return `<g transform="${t}"${op}${blend}${name}>${body}</g>`
  }

  shape(el: ShapeElement): string {
    const sw = el.strokeWidth ?? 0
    const stroke = sw > 0 ? ` ${paint('stroke', el.stroke ?? '#000000')} stroke-width="${num(sw)}" stroke-linejoin="round"${dashFor(el.strokeDash, sw)}` : ''
    const rule = el.shape === 'ring' ? ' fill-rule="evenodd"' : ''
    return `<path d="${shapePath(el.shape, el.width, el.height, el.radius ?? 0)}" ${this.fill(el.fill, el.width, el.height)}${rule}${stroke}/>`
  }

  private head(kind: LineHead, x: number, dir: 1 | -1, el: LineElement): string {
    const s = Math.max(6, el.strokeWidth * 3)
    const col = paint('stroke', el.stroke)
    const fil = paint('fill', el.stroke)
    const pts = (p: number[]) => p.map(num).join(' ')
    switch (kind) {
      case 'arrow':
        return `<polyline points="${pts([x - dir * s, -s * 0.7, x, 0, x - dir * s, s * 0.7])}" fill="none" ${col} stroke-width="${num(el.strokeWidth)}" stroke-linejoin="round" stroke-linecap="round"/>`
      case 'triangle':
        return `<polygon points="${pts([x - dir * s * 1.2, -s * 0.6, x, 0, x - dir * s * 1.2, s * 0.6])}" ${fil} ${col} stroke-width="1" stroke-linejoin="round"/>`
      case 'circle':
        return `<circle cx="${num(x - dir * s * 0.5)}" cy="0" r="${num(s * 0.5)}" ${fil}/>`
      case 'square':
        return `<rect x="${num(x - (dir > 0 ? s : 0))}" y="${num(-s / 2)}" width="${num(s)}" height="${num(s)}" ${fil}/>`
      case 'diamond':
        return `<polygon points="${pts([x, 0, x - dir * s * 0.6, -s * 0.6, x - dir * s * 1.2, 0, x - dir * s * 0.6, s * 0.6])}" ${fil}/>`
      case 'bar':
        return `<line x1="${num(x)}" y1="${num(-s * 0.7)}" x2="${num(x)}" y2="${num(s * 0.7)}" ${col} stroke-width="${num(el.strokeWidth)}" stroke-linecap="round"/>`
      default:
        return ''
    }
  }

  line(el: LineElement): string {
    const s = Math.max(6, el.strokeWidth * 3)
    const inset = (k: LineHead) => (k === 'triangle' ? s * 1.1 : k === 'circle' || k === 'square' || k === 'diamond' ? s * 0.6 : 0)
    const a = inset(el.startHead)
    const b = inset(el.endHead)
    const cap = el.rounded || el.dash === 'dotted' ? 'round' : 'butt'
    const body =
      `<line x1="${num(a)}" y1="0" x2="${num(el.width - b)}" y2="0" ${paint('stroke', el.stroke)} stroke-width="${num(el.strokeWidth)}" stroke-linecap="${cap}"${dashFor(el.dash, el.strokeWidth)}/>` +
      this.head(el.startHead, 0, -1, el) +
      this.head(el.endHead, el.width, 1, el)
    return `<g transform="translate(0 ${num(el.height / 2)})">${body}</g>`
  }

  async image(el: ImageElement): Promise<string> {
    const w = el.width
    const h = el.height
    const masked = (el.mask && el.mask !== 'none' && el.mask !== 'rect') || el.radius
    const outline = shapePath(el.mask && el.mask !== 'none' ? el.mask : 'rect', w, h, el.radius ?? 0)
    const img = el.src ? await loadImage(el.src).catch(() => null) : null
    let inner: string
    if (!img) {
      inner = `<rect width="${num(w)}" height="${num(h)}" fill="${el.placeholder ? '#ece9f6' : '#f0f0f3'}"/>`
    } else {
      const crop = el.crop ?? defaultCrop({ ...el, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight })
      if (hasFilters(el.filters)) {
        // filters are canvas pixel operations; run the real ones and embed the result
        const pr = clamp(crop.width / Math.max(1, w), 1, 3)
        const node = new Konva.Image({ image: img, width: w, height: h, crop })
        node.cache({ pixelRatio: pr })
        node.setAttrs(filterAttrs(el.filters!, pr) as never)
        const href = node.toDataURL({ pixelRatio: pr })
        node.destroy()
        inner = `<image width="${num(w)}" height="${num(h)}" preserveAspectRatio="none" xlink:href="${href}"/>`
      } else {
        const href = await imageDataUrl(img)
        inner =
          `<svg width="${num(w)}" height="${num(h)}" viewBox="${num(crop.x)} ${num(crop.y)} ${num(crop.width)} ${num(crop.height)}" preserveAspectRatio="none" overflow="hidden">` +
          `<image width="${img.naturalWidth}" height="${img.naturalHeight}" xlink:href="${href}"/></svg>`
      }
    }
    let out = masked ? `<g clip-path="url(#${this.clip(outline)})">${inner}</g>` : inner
    if (el.strokeWidth && el.stroke) {
      out += `<path d="${outline}" fill="none" ${paint('stroke', el.stroke)} stroke-width="${num(el.strokeWidth)}"/>`
    }
    return out
  }

  svg(el: SvgElement): string {
    const src = recolorSvg(el.svg, el.colors)
    const doc = new DOMParser().parseFromString(src, 'image/svg+xml')
    const root = doc.documentElement
    if (!root || root.nodeName.toLowerCase() !== 'svg' || doc.getElementsByTagName('parsererror').length) {
      return `<image width="${num(el.width)}" height="${num(el.height)}" preserveAspectRatio="none" xlink:href="${svgDataUrl(src)}"/>`
    }
    if (!root.getAttribute('viewBox')) {
      const vw = parseFloat(root.getAttribute('width') ?? '') || el.width
      const vh = parseFloat(root.getAttribute('height') ?? '') || el.height
      root.setAttribute('viewBox', `0 0 ${vw} ${vh}`)
    }
    // several icons in one file would otherwise fight over ids like "a" or "clip0"
    const pre = this.id('s') + '-'
    const ids = new Set<string>()
    for (const n of Array.from(doc.querySelectorAll('[id]'))) ids.add(n.getAttribute('id')!)
    const fixRefs = (v: string) =>
      v.replace(/url\(\s*['"]?#([^)'"\s]+)['"]?\s*\)/g, (m, id: string) => (ids.has(id) ? `url(#${pre}${id})` : m))
    for (const n of Array.from(doc.querySelectorAll('script, foreignObject'))) n.remove()
    for (const n of [root, ...Array.from(root.querySelectorAll('*'))]) {
      for (const a of Array.from(n.attributes)) {
        if (/^on/i.test(a.name)) {
          n.removeAttribute(a.name)
          continue
        }
        if (a.name === 'id') n.setAttribute('id', pre + a.value)
        else if ((a.name === 'href' || a.name === 'xlink:href') && a.value.startsWith('#') && ids.has(a.value.slice(1))) {
          n.setAttributeNS(a.namespaceURI, a.name, '#' + pre + a.value.slice(1))
        } else if (a.value.includes('url(')) n.setAttribute(a.name, fixRefs(a.value))
      }
      if (n.nodeName.toLowerCase() === 'style' && n.textContent) {
        n.textContent = fixRefs(n.textContent).replace(/#([A-Za-z_][\w-]*)/g, (m, id: string) => (ids.has(id) ? `#${pre}${id}` : m))
      }
    }
    for (const a of ['x', 'y', 'width', 'height', 'preserveAspectRatio']) root.removeAttribute(a)
    root.setAttribute('width', num(el.width))
    root.setAttribute('height', num(el.height))
    root.setAttribute('preserveAspectRatio', 'none')
    return new XMLSerializer().serializeToString(root)
  }

  // Text

  text(el: TextElement): string {
    this.useFont(el.fontFamily, el.fontWeight || 400, !!el.italic)
    const attrs = baseTextAttrs(el)
    const fs = el.fontSize
    const w = el.width
    const fontAttrs =
      `font-family="${esc(`'${el.fontFamily.replace(/'/g, '')}', Inter, sans-serif`)}" font-size="${num(fs)}"` +
      ` font-weight="${el.fontWeight || 400}"${el.italic ? ' font-style="italic"' : ''}` +
      (attrs.letterSpacing ? ` letter-spacing="${num(attrs.letterSpacing)}"` : '')

    let fillRef: string | null = null
    const mainFill = () => {
      if (el.gradient && (el.gradient.type === 'linear' || el.gradient.type === 'radial')) {
        fillRef ??= `fill="url(#${this.gradient(el.gradient, el.width, el.height)})"`
        return fillRef
      }
      return paint('fill', el.color)
    }

    // one copy of the text; effects stack several with different paint
    let copy: (paint: string, extra?: string) => string
    if (el.curve) {
      const pid = this.id('p')
      this.defs.push(`<path id="${pid}" d="${curvePath(el, w, el.height)}"/>`)
      const str = esc(attrs.text.replace(/\n/g, ' '))
      copy = (p, extra = '') =>
        `<text ${fontAttrs} ${p}${extra} xml:space="preserve"${attrs.textDecoration ? ` text-decoration="${attrs.textDecoration}"` : ''}>` +
        `<textPath xlink:href="#${pid}" startOffset="50%" text-anchor="middle">${str}</textPath></text>`
    } else {
      const { spans, decos } = this.layoutLines(el)
      copy = (p, extra = '') => {
        // like Konva: decorations take the fill paint, so hollow copies get none
        const dp = p.replace(/\s?(stroke[\w-]*|paint-order)="[^"]*"/g, '')
        const deco = p.includes('fill="none"') ? '' : decos.map((d) => `<rect x="${num(d.x)}" y="${num(d.y - d.t / 2)}" width="${num(d.w)}" height="${num(d.t)}" ${dp}/>`).join('')
        return `<text ${fontAttrs} ${p}${extra} xml:space="preserve">${spans}</text>${deco}`
      }
    }

    const fx = el.effect ?? { type: 'none' as const }
    const polar = (offset: number, angle: number) => {
      const d = (offset / 100) * fs * 0.25
      return { x: Math.cos(rad(angle)) * d, y: Math.sin(rad(angle)) * d }
    }
    const at = (dx: number, dy: number, s: string, opacity = 1) =>
      `<g${dx || dy ? ` transform="translate(${num(dx)} ${num(dy)})"` : ''}${opacity < 1 ? ` opacity="${num(opacity)}"` : ''}>${s}</g>`
    const withFilter = (f: string, s: string) => `<g filter="url(#${f})">${s}</g>`
    const h = el.height

    switch (fx.type) {
      case 'shadow': {
        const o = polar(fx.offset, fx.angle)
        const f = this.shadow({ color: fx.color, blur: (fx.blur / 100) * fs * 0.5, dx: o.x, dy: o.y, opacity: fx.opacity / 100 }, w, h)
        return withFilter(f, copy(mainFill()))
      }
      case 'lift': {
        const f = this.shadow({ color: '#000000', blur: fs * 0.25 * (0.4 + fx.intensity / 100), dx: 0, dy: fs * 0.05, opacity: 0.15 + (fx.intensity / 100) * 0.35 }, w, h)
        return withFilter(f, copy(mainFill()))
      }
      case 'hollow':
        return copy(`fill="none" ${paint('stroke', el.color)} stroke-width="${num(Math.max(1, (fx.thickness / 100) * fs * 0.08))}"`)
      case 'outline':
        return copy(
          `${mainFill()} ${paint('stroke', fx.color)} stroke-width="${num(Math.max(1, (fx.thickness / 100) * fs * 0.12))}" stroke-linejoin="round" paint-order="stroke"`,
        )
      case 'splice': {
        const o = polar(fx.offset, fx.angle)
        return at(o.x, o.y, copy(paint('fill', fx.color))) +
          copy(`fill="none" ${paint('stroke', el.color)} stroke-width="${num(Math.max(1, (fx.thickness / 100) * fs * 0.08))}"`)
      }
      case 'echo': {
        const o = polar(fx.offset, fx.angle)
        return at(o.x * 2, o.y * 2, copy(paint('fill', fx.color)), 0.25) + at(o.x, o.y, copy(paint('fill', fx.color)), 0.5) + copy(mainFill())
      }
      case 'glitch': {
        const o = polar(fx.offset, fx.angle)
        return at(-o.x, -o.y, copy(paint('fill', fx.colorA))) + at(o.x, o.y, copy(paint('fill', fx.colorB))) + copy(mainFill())
      }
      case 'neon': {
        const blur = fs * (0.15 + (fx.intensity / 100) * 0.5)
        const f1 = this.shadow({ color: el.color, blur: blur * 1.6, dx: 0, dy: 0, opacity: 1 }, w, h)
        const f2 = this.shadow({ color: el.color, blur: blur * 0.5, dx: 0, dy: 0, opacity: 1 }, w, h)
        return withFilter(f1, copy(paint('fill', el.color))) + at(0, 0, withFilter(f2, copy('fill="#ffffff"')), 0.85)
      }
      case 'glow': {
        const f = this.shadow({ color: fx.color, blur: (fx.blur / 100) * fs * 0.8, dx: 0, dy: 0, opacity: 1 }, w, h)
        return withFilter(f, copy(mainFill()))
      }
      case 'background': {
        const pad = (fx.spread / 100) * fs * 0.6
        const r = (fx.roundness / 100) * fs * 0.8
        const bw = w + pad * 2
        const bh = h + pad * 1.2
        const rr = Math.min(r, bw / 2, bh / 2)
        return (
          `<rect x="${num(-pad)}" y="${num(-pad * 0.6)}" width="${num(bw)}" height="${num(bh)}" rx="${num(rr)}" ${paint('fill', fx.color)} opacity="${num(fx.opacity / 100)}"/>` +
          copy(mainFill())
        )
      }
      default:
        return copy(mainFill())
    }
  }

  /** Line breaks and positions taken from Konva itself, so wrapping matches the canvas exactly. */
  private layoutLines(el: TextElement) {
    const attrs = baseTextAttrs(el)
    const node = new Konva.Text({ ...attrs, width: Math.max(1, el.width) })
    const lines = node.textArr
    const fs = el.fontSize
    const lineH = (attrs.lineHeight || 1.2) * fs
    const ls = attrs.letterSpacing
    const w = el.width
    let first = lineH / 2
    if (!Konva.legacyTextRendering) {
      const m = node.measureSize('M')
      const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent
      const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent
      first = (ascent - descent) / 2 + lineH / 2
    }
    const graphemes = (s: string) => Array.from(s).length
    const spans: string[] = []
    const decos: Array<{ x: number; y: number; w: number; t: number }> = []
    const thick = fs / 15
    lines.forEach((ln, i) => {
      const y = first + i * lineH
      let x = 0
      if (el.align === 'right') x = w - ln.width
      else if (el.align === 'center') x = (w - ln.width) / 2
      const justify = el.align === 'justify' && !ln.lastInParagraph && ln.text.includes(' ')
      if (justify) {
        const spaces = ln.text.split(' ').length - 1
        const extra = (w - ln.width) / spaces
        const spaceW = node.measureSize(' ').width + ls
        let cx = x
        ln.text.split(' ').forEach((word, wi) => {
          if (wi > 0) cx += spaceW + extra
          if (word) spans.push(`<tspan x="${num(cx)}" y="${num(y)}">${esc(word)}</tspan>`)
          cx += node.measureSize(word).width + ls * graphemes(word)
        })
      } else if (ln.text) {
        spans.push(`<tspan x="${num(x)}" y="${num(y)}">${esc(ln.text)}</tspan>`)
      }
      const dw = Math.round(justify ? w : ln.width)
      if (el.underline && ln.text) decos.push({ x, y: y + Math.round(fs / 4), w: dw, t: thick })
      if (el.strike && ln.text) decos.push({ x, y: y - Math.round(fs / 4), w: dw, t: thick })
    })
    node.destroy()
    return { spans: spans.join(''), decos }
  }
}

let docSeq = 0

/** A standalone SVG for one page. */
export async function exportSvg(page: Page, opts: SvgOptions = {}): Promise<string> {
  await preparePage(page)
  docSeq += 1
  const wr = new SvgWriter(`k${docSeq}`)
  const parts: string[] = []
  if (!opts.transparent) parts.push(await wr.background(page))
  for (const el of page.elements) {
    if (el.hidden) continue
    parts.push(await wr.element(el))
  }
  const css = opts.embedFonts === false ? '' : await wr.fontCss()
  const style = css ? `<style>${css}</style>` : ''
  const defs = style || wr.defs.length ? `<defs>${style}${wr.defs.join('')}</defs>` : ''
  const W = num(page.width)
  const H = num(page.height)
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    (page.name ? `<title>${esc(page.name)}</title>` : '') +
    defs +
    parts.join('') +
    `</svg>\n`
  )
}
