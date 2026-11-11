import Konva from 'konva'
import { renderDesignAudio } from '@/audio/mix'
import type { DesignDoc, Page } from '@/doc/schema'
import { PageView } from '@/motion/stage'
import { designDuration, paintScene, pageRunTime, pageStarts, sceneAt, timelineAt } from '@/motion/timeline'
import { preparePage } from './raster'

export type VideoFormat = 'mp4' | 'webm' | 'gif'

export type VideoOptions = {
  format: VideoFormat
  /** Output width in px; height follows the page ratio. */
  width: number
  fps: number
  /** Page ids to include, in order. Empty = all. */
  pages?: string[]
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

const MIME: Record<VideoFormat, string> = { mp4: 'video/mp4', webm: 'video/webm', gif: 'image/gif' }
const SAMPLE_RATE = 48000
const GIF_MAX_FPS = 25

/** Quick check for the download dialog. MP4 and WebM need WebCodecs; GIF works everywhere. */
export function videoSupported(format: VideoFormat): boolean {
  if (typeof document === 'undefined') return false
  if (format === 'gif') return true
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined'
}

/** The slower, exact check: can this browser encode the format at this size? */
export async function canEncodeVideo(format: VideoFormat, width = 1280, height = 720): Promise<boolean> {
  if (!videoSupported(format)) return false
  if (format === 'gif') return true
  const mb = await import('mediabunny')
  const size = evenSize(width, height)
  const codec = await mb.getFirstEncodableVideoCodec(format === 'mp4' ? ['avc'] : ['vp9', 'vp8'], size)
  return codec !== null
}

/** The pixel size an export comes out at. H.264 needs even sides, so both are rounded to even. */
export function videoSize(page: Pick<Page, 'width' | 'height'>, width: number) {
  return evenSize(width, (width * page.height) / page.width)
}

function evenSize(w: number, h: number) {
  const even = (v: number) => Math.max(2, Math.round(v / 2) * 2)
  return { width: even(w), height: even(h) }
}

function aborted() {
  return new DOMException('Export canceled', 'AbortError')
}

const tick = () => new Promise((r) => setTimeout(r, 0))

/**
 * Renders design frames at any time on the timeline, transitions included.
 * Pages are built once (PageView) and only their animated elements are
 * re-synced each frame; at most two pages are alive at a time.
 */
class FramePainter {
  readonly canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private host: HTMLDivElement
  private stage: Konva.Stage
  private layers: [Konva.Layer, Konva.Layer]
  private views = new Map<number, { view: PageView; layer: Konva.Layer; drawn: boolean }>()
  private last = ''

  constructor(readonly pages: Page[], readonly width: number, readonly height: number, readFrequently = false) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = width
    this.canvas.height = height
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: readFrequently })!
    this.host = document.createElement('div')
    this.host.style.cssText = 'position:fixed;left:-99999px;top:0;pointer-events:none'
    document.body.appendChild(this.host)
    this.stage = new Konva.Stage({ container: this.host, width, height, listening: false })
    this.layers = [new Konva.Layer({ listening: false }), new Konva.Layer({ listening: false })]
    for (const l of this.layers) {
      this.stage.add(l)
      l.getCanvas().setPixelRatio(1)
    }
  }

  private viewFor(i: number) {
    let v = this.views.get(i)
    if (!v) {
      const page = this.pages[i]
      const layer = this.layers[i % 2]
      layer.destroyChildren()
      for (const [k, other] of this.views) if (other.layer === layer) this.views.delete(k)
      const k = Math.min(this.width / page.width, this.height / page.height)
      const fit = new Konva.Group({ x: (this.width - page.width * k) / 2, y: (this.height - page.height * k) / 2, scaleX: k, scaleY: k })
      const view = new PageView(page, { pixelRatio: Math.min(3, k) }, pageRunTime(page))
      fit.add(view.group)
      layer.add(fit)
      v = { view, layer, drawn: false }
      this.views.set(i, v)
    }
    return v
  }

  private paint(i: number, t: number) {
    const v = this.viewFor(i)
    const changed = v.view.seek(t)
    if (changed || !v.drawn) {
      v.layer.draw()
      v.drawn = true
      return true
    }
    return false
  }

  /** Draw the frame at design time `t`. Returns false when it's the same as the last one. */
  frame(t: number): boolean {
    const pt = timelineAt(this.pages, t)
    let changed = this.paint(pt.index, pt.local)
    let prev: HTMLCanvasElement | null = null
    const key = pt.transition ? `${pt.transition.prevIndex}>${pt.index}` : `${pt.index}`
    if (pt.transition) {
      const pi = pt.transition.prevIndex
      this.paint(pi, pageRunTime(this.pages[pi]))
      prev = this.views.get(pi)!.layer.getNativeCanvasElement()
      changed = true
    }
    if (key !== this.last) changed = true
    this.last = key
    if (!changed) return false
    const cur = this.views.get(pt.index)!.layer.getNativeCanvasElement()
    const scene = pt.transition?.scene ?? sceneAt(null, this.pages[pt.index], 1)
    paintScene(this.ctx, scene, { outgoing: prev, incoming: cur }, this.width, this.height)
    return true
  }

  pageIndexAt(t: number) {
    return timelineAt(this.pages, t)
  }

  invalidate() {
    this.last = ''
  }

  pixels(): ImageData {
    return this.ctx.getImageData(0, 0, this.width, this.height)
  }

  destroy() {
    this.stage.destroy()
    this.host.remove()
  }
}

function choosePages(doc: DesignDoc, ids?: string[]): Page[] {
  if (!ids?.length) return doc.pages
  return ids.map((id) => doc.pages.find((p) => p.id === id)).filter(Boolean) as Page[]
}

function sliceAudio(buf: AudioBuffer, from: number, length: number): AudioBuffer {
  const n = Math.max(1, Math.min(length, buf.length - from))
  const out = new AudioBuffer({ length: n, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate })
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(from, from + n), c)
  return out
}

/** The design's audio for just these pages, cut and joined to match. */
async function audioFor(doc: DesignDoc, pages: Page[]): Promise<AudioBuffer | null> {
  if (!doc.settings.audio?.length) return null
  const full = await renderDesignAudio(doc, designDuration(doc), SAMPLE_RATE)
  if (!full) return null
  const same = pages.length === doc.pages.length && pages.every((p, i) => p === doc.pages[i])
  if (same) return full
  const starts = pageStarts(doc.pages)
  const ms = (v: number) => Math.round((v / 1000) * SAMPLE_RATE)
  const total = ms(pages.reduce((s, p) => s + pageRunTime(p), 0))
  const out = new AudioBuffer({ length: Math.max(1, total), numberOfChannels: full.numberOfChannels, sampleRate: SAMPLE_RATE })
  let at = 0
  for (const p of pages) {
    const from = ms(starts[doc.pages.indexOf(p)])
    const len = Math.min(ms(pageRunTime(p)), total - at)
    for (let c = 0; c < full.numberOfChannels; c++) {
      out.copyToChannel(full.getChannelData(c).subarray(from, Math.min(full.length, from + len)), c, at)
    }
    at += len
  }
  return out
}

export async function exportVideo(doc: DesignDoc, opts: VideoOptions): Promise<Blob> {
  const { format, signal, onProgress } = opts
  if (!videoSupported(format)) throw new Error(`This browser can't make ${format.toUpperCase()} files. Try GIF, or a recent Chrome, Edge or Safari.`)
  const pages = choosePages(doc, opts.pages)
  if (!pages.length) throw new Error('There are no pages to export')
  const fps = Math.max(1, Math.min(format === 'gif' ? GIF_MAX_FPS : 60, Math.round(opts.fps) || 30))
  const size = videoSize(pages[0], opts.width)
  const totalMs = pages.reduce((s, p) => s + pageRunTime(p), 0)
  const frames = Math.max(1, Math.round((totalMs / 1000) * fps))

  onProgress?.(0)
  for (const p of pages) {
    if (signal?.aborted) throw aborted()
    await preparePage(p)
  }
  const r = new FramePainter(pages, size.width, size.height, format === 'gif')
  try {
    if (format === 'gif') return await encodeGif(r, frames, fps, opts)
    return await encodeVideo(doc, pages, r, frames, fps, opts)
  } finally {
    r.destroy()
  }
}

async function encodeVideo(doc: DesignDoc, pages: Page[], r: FramePainter, frames: number, fps: number, opts: VideoOptions): Promise<Blob> {
  const { format, signal, onProgress } = opts
  const mb = await import('mediabunny')
  const mp4 = format === 'mp4'
  const vcodec = await mb.getFirstEncodableVideoCodec(mp4 ? ['avc'] : ['vp9', 'vp8'], { width: r.width, height: r.height })
  if (!vcodec) {
    throw new Error(mp4
      ? "This browser can't encode MP4 at this size. Try a smaller size, or WebM."
      : "This browser can't encode WebM at this size. Try a smaller size, or MP4.")
  }
  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: mp4 ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat(), target })
  const video = new mb.CanvasSource(r.canvas, { codec: vcodec, quality: mb.QUALITY_HIGH, keyFrameInterval: 2 })
  output.addVideoTrack(video, { frameRate: fps })

  const audio = await audioFor(doc, pages).catch((e) => {
    console.warn('audio skipped', e)
    return null
  })
  if (signal?.aborted) throw aborted()
  onProgress?.(0.05)
  let audioSource: InstanceType<typeof mb.AudioBufferSource> | null = null
  if (audio) {
    const acodec = await mb.getFirstEncodableAudioCodec(mp4 ? ['aac'] : ['opus'], { numberOfChannels: audio.numberOfChannels, sampleRate: audio.sampleRate })
    if (acodec) {
      audioSource = new mb.AudioBufferSource({ codec: acodec, quality: mb.QUALITY_HIGH })
      output.addAudioTrack(audioSource)
    } else {
      console.warn('no audio encoder for', format)
    }
  }

  await output.start()
  try {
    // audio goes in one-second pieces alongside the frames so the muxer never holds much
    let audioAt = 0
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw aborted()
      r.frame((i * 1000) / fps)
      await video.add(i / fps, 1 / fps)
      if (audio && audioSource) {
        const until = Math.min(audio.length, Math.round(((i + 1) / fps + 1) * audio.sampleRate))
        while (audioAt < until) {
          const piece = sliceAudio(audio, audioAt, audio.sampleRate)
          await audioSource.add(piece)
          audioAt += piece.length
        }
      }
      onProgress?.(0.05 + 0.93 * ((i + 1) / frames))
    }
    await output.finalize()
  } catch (e) {
    await output.cancel().catch(() => {})
    throw e
  }
  onProgress?.(1)
  return new Blob([target.buffer!], { type: MIME[format] })
}

type Palette = import('gifenc').Palette

async function encodeGif(r: FramePainter, frames: number, fps: number, opts: VideoOptions): Promise<Blob> {
  const { signal, onProgress } = opts
  const { GIFEncoder, quantize, applyPalette: toIndexed } = await import('gifenc')
  const gif = GIFEncoder()
  const palettes = new Map<number, Palette>()

  // One palette per page, from a few moments of it, keeps colors steady from
  // frame to frame. Transition frames get their own.
  const sample = document.createElement('canvas')
  const pagePalette = (index: number, startMs: number, durMs: number) => {
    let pal = palettes.get(index)
    if (pal) return pal
    const k = Math.min(1, 220 / r.width)
    sample.width = Math.max(1, Math.round(r.width * k))
    sample.height = Math.max(1, Math.round(r.height * k))
    const sctx = sample.getContext('2d', { willReadFrequently: true })!
    const moments = [0.2, 0.45, 0.7, 0.95]
    const all = new Uint8ClampedArray(sample.width * sample.height * 4 * moments.length)
    moments.forEach((m, n) => {
      r.frame(startMs + durMs * m)
      sctx.drawImage(r.canvas, 0, 0, sample.width, sample.height)
      all.set(sctx.getImageData(0, 0, sample.width, sample.height).data, n * sample.width * sample.height * 4)
    })
    r.invalidate()
    pal = quantize(all, 256)
    palettes.set(index, pal)
    return pal
  }

  const pages = r.pages
  const starts = pageStarts(pages)
  let pending: { index: Uint8Array; palette: Palette; delay: number } | null = null
  let first = true
  const flush = () => {
    if (!pending) return
    gif.writeFrame(pending.index, r.width, r.height, { palette: pending.palette, delay: pending.delay, ...(first ? { repeat: 0 } : {}) })
    first = false
    pending = null
  }
  // gif delays are in hundredths of a second, so round on the running clock to avoid drift
  const at = (i: number) => Math.round(((i * 1000) / fps) / 10) * 10

  for (let i = 0; i < frames; i++) {
    if (signal?.aborted) throw aborted()
    const t = (i * 1000) / fps
    const pt = r.pageIndexAt(t)
    const delay = at(i + 1) - at(i)
    const pal = pt.transition ? null : pagePalette(pt.index, starts[pt.index], pageRunTime(pages[pt.index]))
    const changed = r.frame(t)
    if (!changed && pending) {
      pending.delay += delay
    } else {
      flush()
      const data = r.pixels().data
      const palette = pal ?? quantize(data, 256)
      pending = { index: toIndexed(data, palette), palette, delay }
    }
    onProgress?.(0.95 * ((i + 1) / frames))
    if (i % 4 === 3) await tick()
  }
  flush()
  gif.finish()
  onProgress?.(1)
  return new Blob([gif.bytes() as BlobPart], { type: MIME.gif })
}
