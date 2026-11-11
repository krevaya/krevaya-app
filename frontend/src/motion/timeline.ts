import type { AnimPhase, AnimRef, DesignDoc, DesignElement, Page } from '@/doc/schema'
import { DEFAULT_PAGE_DURATION } from '@/doc/schema'
import type { MotionState } from '@/render/konva'
import { bodyOf, entranceMove, exitMove, loopAt, loopMove, poseAt } from './moves'
import { pageChange, sceneOf, traceWindow, type Scene, type Sheet } from './pageChanges'

export { ease, type Easing } from './easing'
export {
  ENTRANCES, EXITS, LOOPS, bodyOf, entranceMove, exitMove, loopAt, loopMove, poseAt,
  type Body, type Channel, type Loop, type Move, type Tracks,
} from './moves'
export {
  FAMILIES, PAGE_CHANGES, pageChange, restingSheet, sceneOf, traceWindow, windowPath,
  type Family, type PageChange, type Scene, type Sheet, type Side, type Window,
} from './pageChanges'

// Timing for present mode and video export. Times are in ms from the start of a page.

export function pageRunTime(page: Page): number {
  return page.duration ?? DEFAULT_PAGE_DURATION
}

export function designDuration(doc: DesignDoc): number {
  return doc.pages.reduce((sum, p) => sum + pageRunTime(p), 0)
}

/** Where each page starts on the design timeline, ms. */
export function pageStarts(pages: Page[]): number[] {
  let t = 0
  return pages.map((p) => {
    const s = t
    t += pageRunTime(p)
    return s
  })
}

const MOVES = { enter: entranceMove, exit: exitMove, emphasis: loopMove }

export function animDuration(phase: AnimPhase, ref: AnimRef): number {
  return ref.duration ?? MOVES[phase](ref.name)?.ms ?? 600
}

export function hasMotion(el: DesignElement): boolean {
  const a = el.anim
  return !!a && !!(a.enter || a.exit || a.emphasis)
}

/** Stack two motion states: opacity and scale multiply, offsets and rotation add. */
export function combineMotion(a: MotionState | null, b: MotionState): MotionState {
  if (!a) return { ...b }
  const out: MotionState = { ...a }
  if (b.opacity !== undefined) out.opacity = (a.opacity ?? 1) * b.opacity
  if (b.dx !== undefined) out.dx = (a.dx ?? 0) + b.dx
  if (b.dy !== undefined) out.dy = (a.dy ?? 0) + b.dy
  if (b.scaleX !== undefined) out.scaleX = (a.scaleX ?? 1) * b.scaleX
  if (b.scaleY !== undefined) out.scaleY = (a.scaleY ?? 1) * b.scaleY
  if (b.rotation !== undefined) out.rotation = (a.rotation ?? 0) + b.rotation
  if (b.blur !== undefined) out.blur = Math.max(a.blur ?? 0, b.blur)
  if (b.clip) {
    const c = a.clip ?? [0, 0, 1, 1]
    out.clip = [Math.max(c[0], b.clip[0]), Math.max(c[1], b.clip[1]), Math.min(c[2], b.clip[2]), Math.min(c[3], b.clip[3])]
  }
  return out
}

/**
 * How an element looks `t` ms into its page. Null means "as designed".
 * `pageMs` is when the page ends (exits finish there); pass Infinity to keep a
 * page up with no exits, as present mode does when clicking through by hand.
 */
export function motionAt(el: DesignElement, page: Page, t: number, pageMs = pageRunTime(page)): MotionState | null {
  const a = el.anim
  if (!a) return null
  const body = bodyOf(el, page)
  let out: MotionState | null = null

  let enterEnd = 0
  const en = a.enter && entranceMove(a.enter.name)
  if (a.enter && en) {
    const start = a.enter.delay ?? 0
    const dur = Math.max(1, a.enter.duration ?? en.ms)
    enterEnd = start + dur
    if (t < enterEnd) out = combineMotion(out, poseAt(en, (t - start) / dur, body))
  }

  let exitStart = pageMs
  const ex = a.exit && exitMove(a.exit.name)
  if (a.exit && ex && Number.isFinite(pageMs)) {
    const dur = Math.max(1, Math.min(a.exit.duration ?? ex.ms, pageMs))
    // an exit's delay is the gap it leaves before the page ends
    exitStart = pageMs - (a.exit.delay ?? 0) - dur
    if (t > exitStart) out = combineMotion(out, poseAt(ex, (t - exitStart) / dur, body))
  }

  const lp = a.emphasis && loopMove(a.emphasis.name)
  if (a.emphasis && lp) {
    const start = enterEnd + (a.emphasis.delay ?? 0)
    if (t > start && t < exitStart) {
      const period = Math.max(100, a.emphasis.duration ?? lp.ms)
      const local = t - start
      // ramps up after it starts and back down before an exit
      const amount = Math.min(1, local / 250, (exitStart - t) / 250)
      out = combineMotion(out, loopAt(lp, (local % period) / period, amount, body))
    }
  }
  return out
}

/** Time until every enter animation on a page has finished, ms. */
export function pageSettleTime(page: Page): number {
  let t = 0
  for (const el of page.elements) {
    const en = el.anim?.enter
    if (en) t = Math.max(t, (en.delay ?? 0) + animDuration('enter', en))
  }
  return t
}

// Page changes. A page's `transition` is how it arrives from the page before.

export function transitionDuration(page: Page): number {
  const tr = page.transition
  const def = tr && pageChange(tr.name)
  if (!tr || !def) return 0
  return Math.max(0, Math.min(tr.duration || def.ms, pageRunTime(page)))
}

/** The scene `progress` (0..1) of the way into `nextPage`'s change. Without a page before, just the new one. */
export function sceneAt(prevPage: Page | null, nextPage: Page, progress: number): Scene {
  return sceneOf(prevPage ? pageChange(nextPage.transition?.name) : undefined, progress)
}

export type TimelinePoint = {
  index: number
  /** ms into that page */
  local: number
  /** Set while the page is still arriving: the previous page and how far along we are. */
  transition: { prevIndex: number; progress: number; scene: Scene } | null
}

/** Which page shows at design time `t`, and whether it's mid-change. */
export function timelineAt(pages: Page[], t: number): TimelinePoint {
  const starts = pageStarts(pages)
  let index = pages.length - 1
  for (let i = 0; i < pages.length; i++) {
    if (t < starts[i] + pageRunTime(pages[i])) {
      index = i
      break
    }
  }
  index = Math.max(0, index)
  const local = Math.max(0, t - (starts[index] ?? 0))
  const td = index > 0 ? transitionDuration(pages[index]) : 0
  const transition = td > 0 && local < td
    ? { prevIndex: index - 1, progress: local / td, scene: sceneAt(pages[index - 1], pages[index], local / td) }
    : null
  return { index, local, transition }
}

/** Paint one sheet onto a 2D canvas the size of the page. */
function paintSheet(ctx: CanvasRenderingContext2D, img: CanvasImageSource, s: Sheet, w: number, h: number) {
  ctx.save()
  ctx.globalAlpha = s.alpha
  if (s.window) {
    ctx.beginPath()
    traceWindow(ctx, s.window, w, h)
    ctx.clip()
  }
  ctx.translate(w / 2 + (s.shiftX / 100) * w, h / 2 + (s.shiftY / 100) * h)
  ctx.scale(s.zoomX, s.zoomY)
  ctx.drawImage(img, -w / 2, -h / 2, w, h)
  ctx.restore()
}

/** Paint a scene. `outgoing` is null when no page change is going on. */
export function paintScene(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  pages: { outgoing: CanvasImageSource | null; incoming: CanvasImageSource },
  w: number,
  h: number,
) {
  ctx.save()
  ctx.fillStyle = scene.matte
  ctx.fillRect(0, 0, w, h)
  for (const s of scene.sheets) {
    const img = pages[s.side]
    if (img) paintSheet(ctx, img, s, w, h)
  }
  ctx.restore()
}
