import { cmyk, PDFDocument, type PDFPage } from 'pdf-lib'
import type { DesignElement, ImageElement, Page } from '@/doc/schema'
import { loadImage } from '@/render/assets'
import { defaultCrop } from '@/render/konva'
import { abortError, nextFrame, pageDpi } from './paper'
import { blobFromCanvas, renderPageCanvas } from './raster'

export type PrintOptions = { bleedMm: number; cropMarks: boolean }

export type PdfOptions = {
  title: string
  /** Set for the print variant: bleed, crop marks, TrimBox/BleedBox. */
  print?: PrintOptions | null
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

const TARGET_DPI = 300
// pixel budgets per page; past this the raster gets scaled down
const MAX_PIXELS = { standard: 16e6, print: 40e6 }
const MAX_SIDE = 14000

// crop marks: 18pt long, starting 3pt outside the bleed, in a slug around the bleed box
const TRIM_OFFSET = 3
const MARK_LEN = 18
const SLUG = TRIM_OFFSET + MARK_LEN + 3

function hasPhotos(page: Page) {
  return page.background?.type === 'image' || page.elements.some((e) => e.type === 'image' && !e.hidden && e.src)
}

function opaqueBackground(page: Page) {
  const bg = page.background
  if (!bg) return true
  const alpha = (c: string) => {
    if (c === 'transparent') return 0
    const m = c.match(/rgba?\([^)]*[,\s/]\s*([\d.]+)\s*\)$/i)
    if (m && c.split(',').length === 4) return parseFloat(m[1])
    const h = c.match(/^#[0-9a-f]{6}([0-9a-f]{2})$/i)
    return h ? parseInt(h[1], 16) / 255 : 1
  }
  if (bg.type === 'solid') return alpha(bg.color) >= 1
  if (bg.type === 'linear' || bg.type === 'radial') return bg.stops.every((s) => alpha(s.color) >= 1)
  return true
}

/** Stretch an unrotated edge-touching element out into the bleed, where that can be done without distortion. */
function bleedElement(el: DesignElement, page: Page, b: number): DesignElement {
  const moved = { ...el, x: el.x + b, y: el.y + b } as DesignElement
  if ((el.rotation || 0) % 360 !== 0 || el.hidden) return moved
  const touch = {
    l: el.x <= 0.5,
    t: el.y <= 0.5,
    r: el.x + el.width >= page.width - 0.5,
    b: el.y + el.height >= page.height - 0.5,
  }
  if (!touch.l && !touch.t && !touch.r && !touch.b) return moved
  const ext = { l: touch.l ? b : 0, t: touch.t ? b : 0, r: touch.r ? b : 0, b: touch.b ? b : 0 }

  if (el.type === 'shape' && el.shape === 'rect' && !(el.strokeWidth && el.stroke) && el.fill.type === 'solid' && !el.shadow) {
    return { ...moved, x: moved.x - ext.l, y: moved.y - ext.t, width: el.width + ext.l + ext.r, height: el.height + ext.t + ext.b }
  }
  if (el.type === 'image' && el.src && (!el.mask || el.mask === 'none' || el.mask === 'rect') && !el.radius && !el.strokeWidth && !el.shadow && !el.flipX && !el.flipY) {
    const img: ImageElement = el
    const crop = img.crop ?? defaultCrop(img)
    const kx = crop.width / el.width
    const ky = crop.height / el.height
    // only grow a side when the photo has real pixels there; otherwise it would stretch
    const nw = img.naturalWidth || crop.x + crop.width
    const nh = img.naturalHeight || crop.y + crop.height
    const l = Math.min(ext.l, crop.x / kx)
    const t = Math.min(ext.t, crop.y / ky)
    const r = Math.min(ext.r, (nw - crop.x - crop.width) / kx)
    const bt = Math.min(ext.b, (nh - crop.y - crop.height) / ky)
    return {
      ...img,
      x: moved.x - l,
      y: moved.y - t,
      width: el.width + l + r,
      height: el.height + t + bt,
      crop: { x: crop.x - l * kx, y: crop.y - t * ky, width: crop.width + (l + r) * kx, height: crop.height + (t + bt) * ky },
    }
  }
  return moved
}

/**
 * The page drawn bigger by `b` px on every side, for print bleed. Content is
 * offset by b; the background fill simply covers the larger box (gradients and
 * cover photos stretch by a hair), an image background is also laid exactly over
 * the trim area and grown outward from the photo's own pixels, and edge-touching
 * rectangles and photos are extended into the bleed. Other elements that cross
 * the trim line are cut off at the bleed edge, which is what printers expect.
 */
async function bleedPage(page: Page, b: number): Promise<Page> {
  const elements = page.elements.map((el) => bleedElement(el, page, b))
  const out: Page = { ...page, width: page.width + b * 2, height: page.height + b * 2, elements }
  if (page.background?.type === 'image') {
    const img = await loadImage(page.background.src).catch(() => null)
    if (img) {
      const bgEl: ImageElement = {
        id: '__bleed_bg', type: 'image', x: 0, y: 0, width: page.width, height: page.height, rotation: 0, opacity: 1,
        src: page.background.src, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
      }
      bgEl.crop = defaultCrop(bgEl)
      out.elements = [bleedElement(bgEl, page, b), ...elements]
    }
  }
  return out
}

function paintTrimMarks(pg: PDFPage, x: number, y: number, w: number, h: number, bleed: number) {
  const color = cmyk(1, 1, 1, 1) // registration black, so marks show on every plate
  const thickness = 0.5
  const near = bleed + TRIM_OFFSET
  const far = near + MARK_LEN
  const line = (x1: number, y1: number, x2: number, y2: number) =>
    pg.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color })
  for (const cx of [x, x + w]) {
    line(cx, y - near, cx, y - far)
    line(cx, y + h + near, cx, y + h + far)
  }
  for (const cy of [y, y + h]) {
    line(x - near, cy, x - far, cy)
    line(x + w + near, cy, x + w + far, cy)
  }
}

export async function exportPdf(pages: Page[], opts: PdfOptions): Promise<Blob> {
  const pdf = await PDFDocument.create()
  pdf.setTitle(opts.title || 'Design')
  pdf.setCreator('Krevaya')
  pdf.setProducer('Krevaya')
  pdf.setCreationDate(new Date())
  const print = opts.print ?? null

  for (let i = 0; i < pages.length; i++) {
    if (opts.signal?.aborted) throw abortError()
    const page = pages[i]
    const dpi = pageDpi(page)
    const bleedPixels = print && print.bleedMm > 0 ? (print.bleedMm / 25.4) * dpi : 0
    const art = bleedPixels ? await bleedPage(page, bleedPixels) : page

    let scale = TARGET_DPI / dpi
    const budget = print ? MAX_PIXELS.print : MAX_PIXELS.standard
    scale = Math.min(scale, Math.sqrt(budget / (art.width * art.height)), MAX_SIDE / Math.max(art.width, art.height))

    const canvas = await renderPageCanvas(art, scale)
    await nextFrame()
    if (opts.signal?.aborted) throw abortError()

    const png = !opaqueBackground(page)
    const blob = await blobFromCanvas(canvas, png ? 'image/png' : 'image/jpeg', hasPhotos(page) ? 0.92 : 0.95)
    canvas.width = canvas.height = 0
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const image = png ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)

    const pt = 72 / dpi
    const trimW = page.width * pt
    const trimH = page.height * pt
    const bleed = bleedPixels * pt
    const slug = print?.cropMarks ? SLUG : 0
    const pg = pdf.addPage([trimW + (bleed + slug) * 2, trimH + (bleed + slug) * 2])
    pg.drawImage(image, { x: slug, y: slug, width: trimW + bleed * 2, height: trimH + bleed * 2 })
    if (print) {
      pg.setBleedBox(slug, slug, trimW + bleed * 2, trimH + bleed * 2)
      pg.setTrimBox(slug + bleed, slug + bleed, trimW, trimH)
      if (print.cropMarks) paintTrimMarks(pg, slug + bleed, slug + bleed, trimW, trimH, bleed)
    }
    opts.onProgress?.((i + 1) / pages.length)
    await nextFrame()
  }
  if (opts.signal?.aborted) throw abortError()
  const out = await pdf.save()
  return new Blob([out as BlobPart], { type: 'application/pdf' })
}
