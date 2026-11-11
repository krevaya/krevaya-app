import Konva from 'konva'
import type { Page } from '@/doc/schema'
import { ensureFont, loadImage, svgImageSrc } from '@/render/assets'
import { ensureFontCatalog } from '@/editor/fonts'
import { buildPage, pageImageSources, type RenderCtx } from '@/render/konva'

/** Wait until every image, SVG and font a page uses is ready to draw at `scale`. */
export async function preparePage(page: Page, scale = 1) {
  // the server font catalog may still be loading when an export starts right after opening
  await ensureFontCatalog()
  const jobs: Array<Promise<unknown>> = pageImageSources(page).map((s) => loadImage(s).catch(() => null))
  const pr = Math.min(4, scale)
  for (const el of page.elements) {
    if (el.hidden) continue
    if (el.type === 'text') {
      jobs.push(ensureFont(el.fontFamily, el.fontWeight, el.italic))
      // the canvas falls back to Inter (see baseTextAttrs), so have it ready too
      jobs.push(ensureFont('Inter', el.fontWeight, el.italic))
    }
    if (el.type === 'svg') {
      jobs.push(loadImage(svgImageSrc(el.svg, el.colors, el.width, el.height)).catch(() => null))
      if (pr > 1) jobs.push(loadImage(svgImageSrc(el.svg, el.colors, el.width * pr, el.height * pr)).catch(() => null))
    }
  }
  await Promise.all(jobs)
  await document.fonts.ready
}

let scratch: { stage: Konva.Stage; layer: Konva.Layer; host: HTMLDivElement } | null = null

function stageFor(w: number, h: number) {
  if (!scratch) {
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none'
    document.body.appendChild(host)
    const stage = new Konva.Stage({ container: host, width: w, height: h })
    const layer = new Konva.Layer()
    stage.add(layer)
    scratch = { stage, layer, host }
  }
  scratch.stage.size({ width: w, height: h })
  scratch.layer.destroyChildren()
  return scratch
}

/** Draw a page into a canvas at the given scale. Pass `motion` to draw one animation frame. */
export function drawPage(page: Page, scale: number, ctx: RenderCtx = {}): HTMLCanvasElement {
  const { layer } = stageFor(page.width, page.height)
  const group = buildPage(page, { pixelRatio: scale, ...ctx })
  layer.add(group)
  const canvas = layer.toCanvas({ x: 0, y: 0, width: page.width, height: page.height, pixelRatio: scale })
  layer.destroyChildren()
  return canvas
}

export async function renderPageCanvas(page: Page, scale = 1, ctx: RenderCtx = {}) {
  await preparePage(page, scale)
  return drawPage(page, scale, ctx)
}

export async function renderThumbnail(page: Page, maxSide = 480): Promise<string> {
  const scale = Math.min(1, maxSide / Math.max(page.width, page.height))
  const canvas = await renderPageCanvas(page, scale)
  return canvas.toDataURL('image/png')
}

export function blobFromCanvas(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('export failed'))), type, quality))
}

export async function exportRaster(page: Page, type: 'png' | 'jpg', scale = 1, quality = 0.92, transparent = false): Promise<Blob> {
  const p = transparent && type === 'png' ? { ...page, background: { type: 'solid' as const, color: 'rgba(0,0,0,0)' } } : page
  const canvas = await renderPageCanvas(p, scale)
  if (type === 'jpg') {
    // JPG has no alpha: flatten onto white so transparent areas don't turn black.
    const flat = document.createElement('canvas')
    flat.width = canvas.width
    flat.height = canvas.height
    const c = flat.getContext('2d')!
    c.fillStyle = '#ffffff'
    c.fillRect(0, 0, flat.width, flat.height)
    c.drawImage(canvas, 0, 0)
    return blobFromCanvas(flat, 'image/jpeg', quality)
  }
  return blobFromCanvas(canvas, 'image/png')
}

type SavePicker = (opts: { suggestedName: string; types?: Array<{ description?: string; accept: Record<string, string[]> }> }) =>
  Promise<{ createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> }>

// past this size it's worth letting people pick where the file goes
const PICKER_FROM_BYTES = 64 * 1024 * 1024

async function saveWithPicker(blob: Blob, filename: string): Promise<'saved' | 'canceled' | 'unavailable'> {
  const pick = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker
  const active = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive
  if (!pick || !active || blob.size < PICKER_FROM_BYTES) return 'unavailable'
  try {
    const ext = filename.includes('.') ? filename.slice(filename.lastIndexOf('.')) : ''
    const handle = await pick({ suggestedName: filename, types: blob.type && ext ? [{ accept: { [blob.type]: [ext] } }] : undefined })
    const out = await handle.createWritable()
    await out.write(blob)
    await out.close()
    return 'saved'
  } catch (e) {
    return (e as DOMException)?.name === 'AbortError' ? 'canceled' : 'unavailable'
  }
}

/** Hands a file to the browser. Big files get a save dialog where the browser has one. */
export async function download(blob: Blob, filename: string) {
  const viaPicker = await saveWithPicker(blob, filename)
  if (viaPicker !== 'unavailable') return
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // the browser has the file once the save prompt is gone or the tab comes back;
  // the timer covers browsers that save without either
  const release = () => {
    URL.revokeObjectURL(url)
    window.removeEventListener('focus', release)
    document.removeEventListener('visibilitychange', onVisible)
    clearTimeout(timer)
  }
  const onVisible = () => document.visibilityState === 'visible' && release()
  window.addEventListener('focus', release)
  document.addEventListener('visibilitychange', onVisible)
  const timer = setTimeout(release, 120_000)
}

export function safeName(title: string) {
  return (title || 'design').replace(/[\\/:*?"<>|]+/g, '').trim().slice(0, 80) || 'design'
}
