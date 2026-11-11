// Image, SVG and font loading for the renderer. Everything here is cached, and
// anything that finishes loading later calls the `onReady` listeners so the
// canvas can redraw.

const images = new Map<string, HTMLImageElement>()
const pending = new Map<string, Promise<HTMLImageElement>>()
const readyListeners = new Set<() => void>()

export function onAssetReady(fn: () => void) {
  readyListeners.add(fn)
  return () => readyListeners.delete(fn)
}

let notifyQueued = false
function notify() {
  if (notifyQueued) return
  notifyQueued = true
  requestAnimationFrame(() => {
    notifyQueued = false
    for (const fn of readyListeners) fn()
  })
}

type Resolver = (src: string) => Promise<string>
let resolver: Resolver = async (s) => s

/** Lets guest uploads ("local:<id>") turn into blob URLs before loading. */
export function setSourceResolver(fn: Resolver) {
  resolver = fn
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  const hit = images.get(src)
  if (hit) return Promise.resolve(hit)
  let p = pending.get(src)
  if (!p) {
    p = resolver(src).then((real) => new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      if (!real.startsWith('data:') && !real.startsWith('blob:')) img.crossOrigin = 'anonymous'
      img.decoding = 'async'
      img.onload = () => {
        images.set(src, img)
        pending.delete(src)
        resolve(img)
        notify()
      }
      img.onerror = () => {
        pending.delete(src)
        reject(new Error(`could not load ${src.slice(0, 80)}`))
      }
      img.src = real
    }))
    p.catch(() => pending.delete(src))
    pending.set(src, p)
    p.catch(() => {})
  }
  return p
}

/** The image if it's already loaded; otherwise starts loading and returns null. */
export function imageNow(src: string): HTMLImageElement | null {
  const hit = images.get(src)
  if (hit) return hit
  if (src) void loadImage(src).catch(() => {})
  return null
}

export function recolorSvg(svg: string, colors?: Record<string, string>): string {
  if (!colors) return svg
  let out = svg
  for (const [from, to] of Object.entries(colors)) {
    if (!to) continue
    if (from === 'currentColor') {
      out = out.replace(/currentColor/g, to)
      continue
    }
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    out = out.replace(new RegExp(esc, 'gi'), to)
  }
  return out
}

/** Give the SVG an explicit size so browsers rasterize it sharply at that size. */
export function sizedSvg(svg: string, w: number, h: number): string {
  return svg.replace(/<svg\b([^>]*)>/i, (_m, attrs: string) => {
    const cleaned = attrs.replace(/\s(width|height)="[^"]*"/gi, '').replace(/\spreserveAspectRatio="[^"]*"/i, '')
    const ns = /xmlns=/.test(cleaned) ? '' : ' xmlns="http://www.w3.org/2000/svg"'
    return `<svg${cleaned}${ns} width="${Math.max(1, Math.round(w))}" height="${Math.max(1, Math.round(h))}" preserveAspectRatio="none">`
  })
}

export function svgDataUrl(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/** The data URL svgImageNow loads, so exports can wait for exactly that image. */
export function svgImageSrc(svg: string, colors: Record<string, string> | undefined, w: number, h: number) {
  // Bucket sizes so resizing doesn't make a new image every pixel.
  const bw = Math.ceil(w / 64) * 64
  const bh = Math.ceil(h / 64) * 64
  return svgDataUrl(sizedSvg(recolorSvg(svg, colors), bw, bh))
}

export function svgImageNow(svg: string, colors: Record<string, string> | undefined, w: number, h: number) {
  return imageNow(svgImageSrc(svg, colors, w, h))
}

/** Colors used in an SVG, for the recolor swatches. */
export function svgColors(svg: string): string[] {
  const found = new Set<string>()
  for (const m of svg.matchAll(/(?:fill|stroke|stop-color)\s*[=:]\s*["']?(#[0-9a-f]{3,8}|currentColor)/gi)) {
    found.add(m[1].toLowerCase() === 'currentcolor' ? 'currentColor' : m[1].toLowerCase())
  }
  return [...found].slice(0, 12)
}

// Fonts

export type FontFile = { weight: number; style: 'normal' | 'italic'; url: string }
export type FontInfo = { family: string; category: string; files: FontFile[]; custom?: boolean }

const fontCatalog = new Map<string, FontInfo>()
const fontLoads = new Map<string, Promise<void>>()

export function registerFonts(fonts: FontInfo[]) {
  for (const f of fonts) fontCatalog.set(f.family, f)
}

export function forgetFonts(test: (f: FontInfo) => boolean) {
  for (const [k, f] of fontCatalog) if (test(f)) fontCatalog.delete(k)
}

export function knownFonts(): FontInfo[] {
  return [...fontCatalog.values()]
}

function nearest(files: FontFile[], weight: number, italic: boolean): FontFile | undefined {
  const style = italic ? 'italic' : 'normal'
  const pool = files.filter((f) => f.style === style)
  const list = pool.length ? pool : files
  return [...list].sort((a, b) => Math.abs(a.weight - weight) - Math.abs(b.weight - weight))[0]
}

export function ensureFont(family: string, weight = 400, italic = false): Promise<void> {
  const info = fontCatalog.get(family)
  if (!info || !info.files.length) return Promise.resolve()
  const file = nearest(info.files, weight, italic)
  if (!file) return Promise.resolve()
  const key = `${family}|${file.weight}|${file.style}`
  let p = fontLoads.get(key)
  if (!p) {
    const face = new FontFace(family, `url(${file.url})`, {
      weight: String(file.weight),
      style: file.style,
      display: 'swap',
    })
    p = face
      .load()
      .then((f) => {
        document.fonts.add(f)
        notify()
      })
      .catch(() => {})
    fontLoads.set(key, p)
  }
  return p
}

export function fontReady(family: string, weight = 400, italic = false): boolean {
  const info = fontCatalog.get(family)
  if (!info) return true
  return document.fonts.check(`${italic ? 'italic ' : ''}${weight} 16px "${family}"`)
}
