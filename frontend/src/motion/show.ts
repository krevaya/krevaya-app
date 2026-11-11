import Konva from 'konva'
import type { Page } from '@/doc/schema'
import { poseSheet, PageView } from './stage'
import { restingSheet, sceneAt, transitionDuration } from './timeline'

type Slot = { page: Page; view: PageView; outer: Konva.Group; wrap: Konva.Group }

/**
 * The stage present mode draws on: one page at a time, fitted to the screen,
 * with its animations running and a transition from the page before.
 */
export class ShowStage {
  private stage: Konva.Stage
  private layer = new Konva.Layer({ listening: false })
  private backdrop = new Konva.Rect({ visible: false })
  private cur: Slot | null = null
  private prev: Slot | null = null
  private td = 0
  private start = performance.now()
  private raf = 0
  /** Called every frame with ms since the current page appeared. */
  onTick?: (t: number) => void

  constructor(container: HTMLDivElement) {
    this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight, listening: false })
    this.layer.add(this.backdrop)
    this.stage.add(this.layer)
    this.raf = requestAnimationFrame(this.loop)
  }

  resize(w: number, h: number) {
    this.stage.size({ width: w, height: h })
    for (const s of [this.prev, this.cur]) if (s) this.fit(s)
    this.layer.batchDraw()
  }

  /** Show a page from its first moment. With `from`, play its transition from that page. */
  show(page: Page, pageMs: number, from: Page | null = null) {
    const keep = from && this.cur && this.cur.page.id === from.id ? this.cur : null
    if (this.prev) this.drop(this.prev)
    if (this.cur && this.cur !== keep) this.drop(this.cur)
    this.prev = null
    this.cur = this.slot(page, pageMs)
    this.td = 0
    if (keep && transitionDuration(page) > 0) {
      this.prev = keep
      this.td = transitionDuration(page)
    } else if (keep) {
      this.drop(keep)
    }
    this.start = performance.now()
    this.step()
  }

  /** Start the current page over, e.g. when autoplay turns on. */
  restart(pageMs: number) {
    if (!this.cur) return
    this.show(this.cur.page, pageMs)
  }

  destroy() {
    cancelAnimationFrame(this.raf)
    this.stage.destroy()
  }

  private slot(page: Page, pageMs: number): Slot {
    const outer = new Konva.Group({ clip: { x: 0, y: 0, width: page.width, height: page.height } })
    const wrap = new Konva.Group()
    const scale = this.scaleFor(page)
    const view = new PageView(page, { pixelRatio: Math.min(3, scale * (window.devicePixelRatio || 1)) }, pageMs)
    wrap.add(view.group)
    outer.add(wrap)
    this.layer.add(outer)
    const s = { page, view, outer, wrap }
    this.fit(s)
    return s
  }

  private drop(s: Slot) {
    s.outer.destroy()
  }

  private scaleFor(page: Page) {
    return Math.min(this.stage.width() / page.width, this.stage.height() / page.height)
  }

  private fit(s: Slot) {
    const k = this.scaleFor(s.page)
    s.outer.setAttrs({
      x: (this.stage.width() - s.page.width * k) / 2,
      y: (this.stage.height() - s.page.height * k) / 2,
      scaleX: k,
      scaleY: k,
    })
  }

  private step() {
    const cur = this.cur
    if (!cur) return
    const t = performance.now() - this.start
    let dirty = cur.view.seek(t)
    const prev = this.prev
    if (prev) {
      dirty = true
      if (t >= this.td) {
        this.drop(prev)
        this.prev = null
        this.backdrop.visible(false)
        poseSheet(cur.wrap, restingSheet(), cur.page.width, cur.page.height)
      } else {
        const scene = sceneAt(prev.page, cur.page, t / this.td)
        // the matte fills the new page's box, so dips show their color there and not across the screen
        const k = this.scaleFor(cur.page)
        this.backdrop.setAttrs({
          visible: true, fill: scene.matte, x: cur.outer.x(), y: cur.outer.y(), width: cur.page.width * k, height: cur.page.height * k,
        })
        const slots = { outgoing: prev, incoming: cur }
        poseSheet(prev.wrap, null, prev.page.width, prev.page.height)
        poseSheet(cur.wrap, null, cur.page.width, cur.page.height)
        // sheets come bottom first, so raising each in turn leaves the last one on top
        for (const sh of scene.sheets) {
          const s = slots[sh.side]
          poseSheet(s.wrap, sh, s.page.width, s.page.height)
          s.outer.moveToTop()
        }
      }
    }
    if (dirty) this.layer.batchDraw()
    this.onTick?.(t)
  }

  private loop = () => {
    this.step()
    this.raf = requestAnimationFrame(this.loop)
  }
}
