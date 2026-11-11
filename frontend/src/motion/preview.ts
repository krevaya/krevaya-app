import { useSyncExternalStore } from 'react'
import type { Page } from '@/doc/schema'
import { getEngine } from '@/editor/Canvas'
import { useEditor } from '@/stores/editor'
import { motionAt, pageRunTime } from './timeline'

// Plays animations on the editor canvas, for the Animate panel's preview.

type Playing = { pageId: string; raf: number } | null

let playing: Playing = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function stopPreview() {
  if (!playing) return
  cancelAnimationFrame(playing.raf)
  playing = null
  getEngine()?.setMotion(null)
  emit()
}

/**
 * Play `from`..`to` ms of a page on the canvas. `only` limits it to some
 * elements; the rest stay as designed.
 */
export function playPreview(pageId: string, opts: { from?: number; to?: number; only?: Set<string> } = {}) {
  stopPreview()
  const engine = getEngine()
  const doc = useEditor.getState().doc
  const first = doc?.page(pageId)
  if (!engine || !doc || !first) return
  const from = opts.from ?? 0
  const to = opts.to ?? pageRunTime(first)
  const t0 = performance.now()
  const tick = () => {
    const page: Page | undefined = doc.page(pageId)
    const s = useEditor.getState()
    if (!page || s.pageId !== pageId || s.editingId) return stopPreview()
    const t = from + (performance.now() - t0)
    if (t > to) return stopPreview()
    const pageMs = pageRunTime(page)
    engine.setMotion((el) => (opts.only && !opts.only.has(el.id) ? null : motionAt(el, page, t, pageMs)))
    if (playing) playing.raf = requestAnimationFrame(tick)
  }
  playing = { pageId, raf: requestAnimationFrame(tick) }
  emit()
}

export function usePreviewing(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => playing !== null,
  )
}
