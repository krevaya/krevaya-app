import type { DesignDoc } from '@/doc/schema'
import { renderDesignAudio } from './mix'

let shared: AudioContext | null = null

export function audioContext(): AudioContext {
  if (!shared) shared = new AudioContext({ latencyHint: 'playback' })
  if (shared.state === 'suspended') void shared.resume()
  return shared
}

// Keep the last full mix around so stepping through pages doesn't re-render it.
let mixed: { key: string; buf: Promise<AudioBuffer | null> } | null = null

function mixKey(doc: DesignDoc, totalMs: number, rate: number) {
  return `${rate}|${totalMs}|${JSON.stringify(doc.settings.audio ?? [])}`
}

function designMix(doc: DesignDoc, totalMs: number, rate: number) {
  const key = mixKey(doc, totalMs, rate)
  if (mixed?.key !== key) {
    const buf = renderDesignAudio(doc, totalMs, rate)
    buf.catch(() => {
      if (mixed?.key === key) mixed = null
    })
    mixed = { key, buf }
  }
  return mixed.buf
}

/** Render the design's audio ahead of time so playback starts without a pause. */
export function prepareDesignAudio(doc: DesignDoc, totalMs: number): Promise<void> {
  return designMix(doc, totalMs, audioContext().sampleRate).then(() => undefined, () => undefined)
}

/**
 * Play the design's soundtrack from `fromMs`. The clock starts when this is
 * called: if the mix takes a moment to render, playback joins at the right spot.
 */
export function playDesignAudio(doc: DesignDoc, fromMs: number, totalMs: number): { stop(): void; ready: Promise<void> } {
  const ctx = audioContext()
  const t0 = performance.now()
  let stopped = false
  let src: AudioBufferSourceNode | null = null
  let gain: GainNode | null = null
  const ready = designMix(doc, totalMs, ctx.sampleRate).then((buf) => {
    if (stopped || !buf) return
    const at = fromMs / 1000 + (performance.now() - t0) / 1000
    if (at >= buf.duration) return
    src = ctx.createBufferSource()
    src.buffer = buf
    gain = ctx.createGain()
    src.connect(gain).connect(ctx.destination)
    src.start(0, at)
  }, (e) => console.warn('audio playback failed', e))
  return {
    ready,
    stop() {
      stopped = true
      if (src && gain) {
        // tiny fade so stopping mid-note doesn't click
        const now = ctx.currentTime
        gain.gain.setValueAtTime(gain.gain.value, now)
        gain.gain.linearRampToValueAtTime(0, now + 0.04)
        src.stop(now + 0.05)
      }
      src = null
    },
  }
}

// Previews: one sound at a time across the app.

let stopCurrent: (() => void) | null = null

export function stopPreview() {
  const s = stopCurrent
  stopCurrent = null
  s?.()
}

/** Play a buffer (or one that's still rendering). Returns a function that stops it. */
export function previewBuffer(buf: AudioBuffer | Promise<AudioBuffer>, onEnd?: () => void, opts: { offset?: number; maxSeconds?: number; volume?: number } = {}): () => void {
  stopPreview()
  const ctx = audioContext()
  let src: AudioBufferSourceNode | null = null
  let canceled = false
  let ended = false
  const finish = () => {
    if (ended) return
    ended = true
    if (stopCurrent === stop) stopCurrent = null
    onEnd?.()
  }
  const stop = () => {
    canceled = true
    try {
      src?.stop()
    } catch {
      // never started
    }
    finish()
  }
  stopCurrent = stop
  Promise.resolve(buf).then((b) => {
    if (canceled) return
    src = ctx.createBufferSource()
    src.buffer = b
    const g = ctx.createGain()
    g.gain.value = opts.volume ?? 1
    src.connect(g).connect(ctx.destination)
    src.onended = finish
    const offset = Math.min(b.duration, opts.offset ?? 0)
    src.start(0, offset, opts.maxSeconds ? Math.min(opts.maxSeconds, b.duration - offset) : undefined)
  }, (e) => {
    console.warn('preview failed', e)
    finish()
  })
  return stop
}

/** Preview a plain URL with an audio element (no CORS needed). */
export function previewUrl(url: string | Promise<string>, onEnd?: () => void): () => void {
  stopPreview()
  const audio = new Audio()
  let ended = false
  const finish = () => {
    if (ended) return
    ended = true
    if (stopCurrent === stop) stopCurrent = null
    onEnd?.()
  }
  const stop = () => {
    audio.pause()
    audio.removeAttribute('src')
    finish()
  }
  stopCurrent = stop
  audio.onended = finish
  audio.onerror = finish
  Promise.resolve(url).then((u) => {
    if (ended) return
    audio.src = u
    audio.play().catch(finish)
  }, finish)
  return stop
}
