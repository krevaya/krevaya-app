import Konva from 'konva'
import type { Filter as KonvaFilter } from 'konva/lib/Node'
import type { ImageFilters } from '@/doc/schema'

type Filter = (this: Konva.Node, data: ImageData) => void

// Warm/cool: push red and blue in opposite directions.
const Temperature: Filter = function (data) {
  const t = (this.getAttr('temperature') as number) || 0
  if (!t) return
  const d = data.data
  const k = t * 0.6
  for (let i = 0; i < d.length; i += 4) {
    d[i] = Math.min(255, Math.max(0, d[i] + k))
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] - k))
  }
}

// Darkening on a true circle measured in pixels, reaching full strength at the
// corners, so a wide photo is darkened more at its top and bottom than its sides.
// Nothing changes inside the first half of the half-diagonal; past that the
// darkening grows along a power curve, which keeps the start of it soft.
const Vignette: Filter = function (data) {
  const v = ((this.getAttr('vignette') as number) || 0) / 100
  if (!v) return
  const { width: w, height: h, data: d } = data
  const cx = w / 2, cy = h / 2
  const reach = Math.hypot(cx, cy) || 1
  const clear = 0.5
  const dx2 = new Float32Array(w)
  for (let x = 0; x < w; x++) dx2[x] = (x + 0.5 - cx) ** 2
  for (let y = 0; y < h; y++) {
    const dy2 = (y + 0.5 - cy) ** 2
    for (let x = 0; x < w; x++) {
      const r = Math.sqrt(dx2[x] + dy2) / reach
      if (r <= clear) continue
      const f = 1 - v * Math.pow(Math.min(1, (r - clear) / (1 - clear)), 1.8)
      const i = (y * w + x) * 4
      d[i] *= f
      d[i + 1] *= f
      d[i + 2] *= f
    }
  }
}

export const PRESETS: Record<string, { label: string; values: ImageFilters }> = {
  none: { label: 'As shot', values: {} },
  golden: { label: 'Golden hour', values: { temperature: 30, saturation: 10 } },
  punch: { label: 'Punch', values: { saturation: 32, contrast: 24, temperature: 5 } },
  frost: { label: 'Frost', values: { temperature: -28, brightness: 7, saturation: -6 } },
  sage: { label: 'Sage', values: { hue: 25, saturation: -22, brightness: 8, temperature: -6 } },
  dusk: { label: 'Dusk', values: { temperature: 20, hue: -12, saturation: 15, vignette: 25 } },
  ink: { label: 'Ink', values: { grayscale: true, contrast: 18, brightness: -4 } },
  smoke: { label: 'Smoke', values: { grayscale: true, contrast: 24, brightness: 6, noise: 10 } },
  washed: { label: 'Washed out', values: { contrast: -26, brightness: 24, saturation: -18, temperature: 8 } },
  heirloom: { label: 'Heirloom', values: { sepia: true, contrast: -16, noise: 12, temperature: 10 } },
  grain: { label: 'Grain', values: { contrast: 12, saturation: -8, noise: 14, temperature: 8 } },
  storm: { label: 'Storm', values: { contrast: 28, saturation: -30, vignette: 62, temperature: -12 } },
}

export function hasFilters(f?: ImageFilters): boolean {
  if (!f) return false
  return Boolean(
    f.brightness || f.contrast || f.saturation || f.hue || f.blur || f.temperature || f.vignette ||
      f.grayscale || f.sepia || f.invert || f.pixelate || f.noise,
  )
}

/** Konva attrs that apply the filters to an image node (which must be cached). */
export function filterAttrs(f: ImageFilters, scale = 1): Record<string, unknown> {
  const filters: KonvaFilter[] = []
  const attrs: Record<string, unknown> = {}
  if (f.brightness) {
    filters.push(Konva.Filters.Brighten)
    attrs.brightness = f.brightness / 200
  }
  if (f.contrast) {
    filters.push(Konva.Filters.Contrast)
    attrs.contrast = f.contrast
  }
  if (f.saturation || f.hue) {
    filters.push(Konva.Filters.HSL)
    attrs.saturation = (f.saturation ?? 0) / 100
    attrs.hue = f.hue ?? 0
  }
  if (f.temperature) {
    filters.push(Temperature as KonvaFilter)
    attrs.temperature = f.temperature
  }
  if (f.grayscale) filters.push(Konva.Filters.Grayscale)
  if (f.sepia) filters.push(Konva.Filters.Sepia)
  if (f.invert) filters.push(Konva.Filters.Invert)
  if (f.blur) {
    filters.push(Konva.Filters.Blur)
    attrs.blurRadius = Math.round(f.blur * scale)
  }
  if (f.pixelate) {
    filters.push(Konva.Filters.Pixelate)
    attrs.pixelSize = Math.max(1, Math.round(f.pixelate * scale))
  }
  if (f.noise) {
    filters.push(Konva.Filters.Noise)
    attrs.noise = f.noise / 100
  }
  if (f.vignette) {
    filters.push(Vignette as KonvaFilter)
    attrs.vignette = f.vignette
  }
  return { filters, ...attrs }
}

/** CSS filter string, for previews in the panel. Close enough, not exact. */
export function cssFilter(f?: ImageFilters): string {
  if (!f) return ''
  const parts: string[] = []
  if (f.brightness) parts.push(`brightness(${1 + f.brightness / 100})`)
  if (f.contrast) parts.push(`contrast(${1 + f.contrast / 100})`)
  if (f.saturation) parts.push(`saturate(${1 + f.saturation / 100})`)
  if (f.hue) parts.push(`hue-rotate(${f.hue}deg)`)
  if (f.grayscale) parts.push('grayscale(1)')
  if (f.sepia) parts.push('sepia(0.9)')
  if (f.invert) parts.push('invert(1)')
  if (f.blur) parts.push(`blur(${f.blur / 4}px)`)
  return parts.join(' ')
}

// Filtered pixels are cached per source, crop, size and settings, so moving or
// re-syncing an element doesn't run the filters again.

type Crop = { x: number; y: number; width: number; height: number }

const cache = new Map<string, HTMLCanvasElement>()
const MAX_SIDE = 4096
const MAX_ENTRIES = 64
const MAX_PIXELS = 48e6

function filterKey(f: ImageFilters) {
  return Object.keys(f).filter((k) => k !== 'preset').sort().map((k) => `${k}:${f[k as keyof ImageFilters]}`).join(',')
}

/** Run the filters on raw pixels, the same way Konva does on a cached node. */
export function applyFilters(data: ImageData, f: ImageFilters, scale = 1) {
  const { filters, ...attrs } = filterAttrs(f, scale) as { filters: Filter[] } & Record<string, unknown>
  const node = new Konva.Image({ image: undefined, ...attrs })
  for (const fn of filters) fn.call(node, data)
}

/**
 * The visible part of an image with filters applied, `w` x `h` page units drawn
 * at `pixelRatio`. Returns a canvas to hand to Konva.Image.
 */
export function filteredImage(
  img: CanvasImageSource, src: string, crop: Crop, w: number, h: number, f: ImageFilters, pixelRatio = 1,
): HTMLCanvasElement {
  let pr = pixelRatio
  const side = Math.max(w, h) * pr
  if (side > MAX_SIDE) pr *= MAX_SIDE / side
  const cw = Math.max(1, Math.round(w * pr))
  const ch = Math.max(1, Math.round(h * pr))
  const key = [src, crop.x.toFixed(1), crop.y.toFixed(1), crop.width.toFixed(1), crop.height.toFixed(1), cw, ch, filterKey(f)].join('|')
  const hit = cache.get(key)
  if (hit) {
    cache.delete(key)
    cache.set(key, hit)
    return hit
  }
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const c = canvas.getContext('2d', { willReadFrequently: true })!
  c.drawImage(img, crop.x, crop.y, crop.width, crop.height, 0, 0, cw, ch)
  const data = c.getImageData(0, 0, cw, ch)
  applyFilters(data, f, pr)
  c.putImageData(data, 0, 0)
  cache.set(key, canvas)
  let pixels = 0
  for (const v of cache.values()) pixels += v.width * v.height
  for (const [k, v] of cache) {
    if (cache.size <= MAX_ENTRIES && pixels <= MAX_PIXELS) break
    if (v === canvas) break
    pixels -= v.width * v.height
    cache.delete(k)
  }
  return canvas
}
