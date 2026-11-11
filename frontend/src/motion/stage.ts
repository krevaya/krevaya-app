import Konva from 'konva'
import type { DesignElement, Page } from '@/doc/schema'
import { backgroundNode, buildElement, syncElement, type MotionState, type RenderCtx } from '@/render/konva'
import { traceWindow, type Sheet } from './pageChanges'
import { hasMotion, motionAt, pageRunTime } from './timeline'

/**
 * A page built once as Konva nodes that can be moved to any moment of its
 * animations. Only animated elements are re-synced on seek, so playing a page
 * with photos and filters stays cheap.
 */
export class PageView {
  readonly group: Konva.Group
  private items: Array<{ el: DesignElement; node: Konva.Group; key: string }> = []

  constructor(readonly page: Page, private ctx: RenderCtx = {}, public pageMs = pageRunTime(page), t = 0) {
    this.group = new Konva.Group({ clip: { x: 0, y: 0, width: page.width, height: page.height }, listening: false })
    this.group.add(backgroundNode(page))
    for (const el of page.elements) {
      if (el.hidden) continue
      if (!hasMotion(el)) {
        this.group.add(buildElement(el, ctx))
        continue
      }
      const m = motionAt(el, page, t, pageMs)
      const node = buildElement(el, { ...ctx, motion: () => m })
      this.group.add(node)
      this.items.push({ el, node, key: key(m) })
    }
  }

  get animated() {
    return this.items.length > 0
  }

  /** Move to `t` ms into the page. Returns true when something changed. */
  seek(t: number): boolean {
    let changed = false
    for (const it of this.items) {
      const m = motionAt(it.el, this.page, t, this.pageMs)
      const k = key(m)
      if (k === it.key) continue
      it.key = k
      syncElement(it.node, it.el, { ...this.ctx, motion: () => m })
      changed = true
    }
    return changed
  }

  destroy() {
    this.group.destroy()
  }
}

function key(m: MotionState | null) {
  if (!m) return ''
  const r = (v: number | undefined) => (v === undefined ? '' : Math.round(v * 1000) / 1000)
  return [r(m.opacity), r(m.dx), r(m.dy), r(m.scaleX), r(m.scaleY), r(m.rotation), r(m.blur), m.clip?.map(r).join(',')].join('|')
}

/**
 * Pose the group holding one page (w x h, placed at the page origin) as a sheet
 * of a page change. Null hides it.
 */
export function poseSheet(g: Konva.Group, sheet: Sheet | null, w: number, h: number) {
  if (!sheet || sheet.alpha <= 0) {
    g.visible(false)
    return
  }
  const ox = (sheet.shiftX / 100) * w
  const oy = (sheet.shiftY / 100) * h
  g.setAttrs({
    visible: true,
    opacity: sheet.alpha,
    x: w / 2 + ox,
    y: h / 2 + oy,
    offsetX: w / 2,
    offsetY: h / 2,
    scaleX: sheet.zoomX,
    scaleY: sheet.zoomY,
  })
  const win = sheet.window
  if (!win) {
    g.clipFunc(undefined as never)
    return
  }
  // the group itself is moved and zoomed, so the window is traced back in its own space
  const { zoomX: sx, zoomY: sy } = sheet
  const place = (px: number, py: number) => [(px - w / 2 - ox) / sx + w / 2, (py - h / 2 - oy) / sy + h / 2]
  g.clipFunc((ctx) => {
    ctx.beginPath()
    traceWindow(ctx, win, w, h, place, 1 / Math.min(sx, sy))
  })
}
