import Konva from 'konva'
import type { DesignElement, Page, TextElement } from '@/doc/schema'
import { bounds, corners, type Box } from '@/lib/math'
import { onAssetReady } from '@/render/assets'
import { backgroundNode, buildElement, syncElement, type RenderCtx } from '@/render/konva'
import { measureTextHeight } from '@/render/text'
import { canEdit, useEditor } from '@/stores/editor'
import { updateElements, withTextLayout } from '../actions'

export type View = { zoom: number; panX: number; panY: number; width: number; height: number }

const ACCENT = '#612bd3'
const SNAP_RADIUS = 6
const PAD = 56

type Drag = {
  start: { x: number; y: number }
  orig: Map<string, { x: number; y: number }>
  box: { x: number; y: number; width: number; height: number }
  moved: boolean
  /** Transformer nodes put aside while a multi-selection moves. */
  held?: Konva.Node[]
}

type Marquee = { start: { x: number; y: number }; additive: string[] }

/**
 * Draws the current page with Konva and handles pointer interaction on it.
 * React owns the panels around it; this class owns the canvas.
 */
export class CanvasEngine {
  readonly stage: Konva.Stage
  private pageLayer = new Konva.Layer()
  private uiLayer = new Konva.Layer()
  private pageGroup = new Konva.Group()
  private shadow = new Konva.Rect({ listening: false, fill: '#fff', shadowColor: '#1d1b26', shadowBlur: 18, shadowOpacity: 0.08, shadowOffsetY: 2 })
  private bg: Konva.Shape | null = null
  private nodes = new Map<string, { group: Konva.Group; el: DesignElement }>()
  private page: Page | null = null
  private transformer: Konva.Transformer
  private hover: Konva.Line = new Konva.Line({ closed: true, stroke: ACCENT, strokeWidth: 1.5, listening: false, visible: false })
  private guides = new Konva.Group({ listening: false })
  private marqueeRect = new Konva.Rect({ fill: 'rgba(97,43,211,0.08)', stroke: ACCENT, strokeWidth: 1, visible: false, listening: false })
  private dragFrame = new Konva.Rect({ stroke: ACCENT, strokeWidth: 1.5, visible: false, listening: false })
  private drag: Drag | null = null
  private marquee: Marquee | null = null
  private panning: { x: number; y: number } | null = null
  private space = false
  private transformingText = false
  private unsubs: Array<() => void> = []
  private lastEditing: string | null = null
  private lastHidden = false
  private motion: RenderCtx['motion'] = undefined

  view: View = { zoom: 1, panX: 0, panY: 0, width: 0, height: 0 }
  onView?: (v: View) => void
  onDblClick?: (el: DesignElement) => void
  onContext?: (x: number, y: number) => void
  onStagePointer?: (pageX: number, pageY: number, e: PointerEvent) => boolean

  constructor(container: HTMLDivElement) {
    this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight })
    this.pageLayer.add(this.shadow)
    this.pageLayer.add(this.pageGroup)
    this.stage.add(this.pageLayer)
    this.transformer = new Konva.Transformer({
      rotateAnchorOffset: 28,
      anchorSize: 10,
      anchorCornerRadius: 5,
      anchorStroke: ACCENT,
      anchorFill: '#ffffff',
      anchorStrokeWidth: 1.5,
      borderStroke: ACCENT,
      borderStrokeWidth: 1.5,
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapTolerance: 4,
      keepRatio: true,
      ignoreStroke: true,
      flipEnabled: false,
      boundBoxFunc: (oldBox, newBox) => (Math.abs(newBox.width) < 6 || Math.abs(newBox.height) < 4 ? oldBox : newBox),
    })
    this.uiLayer.add(this.hover, this.guides, this.transformer, this.marqueeRect, this.dragFrame)
    this.stage.add(this.uiLayer)
    this.bindEvents()
    this.unsubs.push(onAssetReady(() => this.refreshAll()))
    document.fonts?.addEventListener?.('loadingdone', this.onFontsLoaded)
    window.addEventListener('keydown', this.onSpace)
    window.addEventListener('keyup', this.onSpace)
  }

  destroy() {
    for (const u of this.unsubs) u()
    document.fonts?.removeEventListener?.('loadingdone', this.onFontsLoaded)
    window.removeEventListener('keydown', this.onSpace)
    window.removeEventListener('keyup', this.onSpace)
    window.removeEventListener('pointermove', this.onWindowMove)
    window.removeEventListener('pointerup', this.onWindowUp)
    this.stage.destroy()
  }

  // View

  resize(w: number, h: number) {
    this.stage.size({ width: w, height: h })
    this.view.width = w
    this.view.height = h
    if (useEditor.getState().autoFit) this.fit()
    else this.applyView()
  }

  fit() {
    if (!this.page) return
    const { width: W, height: H } = this.view
    // Leave room at the top for the floating toolbar.
    const top = PAD + 24
    const z = Math.max(0.02, Math.min((W - PAD * 2) / this.page.width, (H - top - PAD) / this.page.height))
    this.view.zoom = z
    this.view.panX = (W - this.page.width * z) / 2
    this.view.panY = top + (H - top - PAD - this.page.height * z) / 2
    useEditor.setState({ zoom: z })
    this.applyView()
  }

  zoomTo(z: number, anchor?: { x: number; y: number }) {
    const a = anchor ?? { x: this.view.width / 2, y: this.view.height / 2 }
    const old = this.view.zoom
    const px = (a.x - this.view.panX) / old
    const py = (a.y - this.view.panY) / old
    this.view.zoom = z
    this.view.panX = a.x - px * z
    this.view.panY = a.y - py * z
    this.applyView()
  }

  pan(dx: number, dy: number) {
    if (!this.page) return
    const { width: W, height: H, zoom } = this.view
    const pw = this.page.width * zoom
    const ph = this.page.height * zoom
    // Keep at least a strip of the page on screen.
    const clampX = (x: number) => Math.min(W - 80, Math.max(80 - pw, x))
    const clampY = (y: number) => Math.min(H - 80, Math.max(80 - ph, y))
    this.view.panX = clampX(this.view.panX - dx)
    this.view.panY = clampY(this.view.panY - dy)
    this.applyView()
  }

  private applyView() {
    const { zoom, panX, panY } = this.view
    for (const g of [this.pageGroup, this.guides]) g.setAttrs({ x: panX, y: panY, scaleX: zoom, scaleY: zoom })
    if (this.page) this.shadow.setAttrs({ x: panX, y: panY, width: this.page.width * zoom, height: this.page.height * zoom })
    this.hover.visible(false)
    this.transformer.forceUpdate()
    this.stage.batchDraw()
    this.onView?.({ ...this.view })
  }

  toPage(sx: number, sy: number) {
    return { x: (sx - this.view.panX) / this.view.zoom, y: (sy - this.view.panY) / this.view.zoom }
  }

  pointer() {
    const p = this.stage.getPointerPosition() ?? { x: 0, y: 0 }
    return this.toPage(p.x, p.y)
  }

  // Rendering

  render(page: Page | undefined) {
    const s = useEditor.getState()
    if (!page) return
    const pageChanged = !this.page || this.page.id !== page.id
    const sizeChanged = this.page && (this.page.width !== page.width || this.page.height !== page.height)
    const editingChanged = this.lastEditing !== s.editingId
    const hiddenMode = canEdit(s.role)
    const prev = this.page
    this.page = page
    this.lastEditing = s.editingId

    if (pageChanged || !prev || prev.background !== page.background || sizeChanged) {
      this.bg?.destroy()
      this.bg = backgroundNode(page)
      this.pageGroup.add(this.bg)
      this.bg.moveToBottom()
      this.pageGroup.clip({ x: 0, y: 0, width: page.width, height: page.height })
    }
    const ctx = { editingId: s.editingId, showHidden: hiddenMode, pixelRatio: Math.min(2, this.view.zoom * devicePixelRatio), motion: this.motion }
    const seen = new Set<string>()
    page.elements.forEach((el, i) => {
      seen.add(el.id)
      const hit = this.nodes.get(el.id)
      if (!hit) {
        const group = buildElement(el, ctx)
        this.pageGroup.add(group)
        this.nodes.set(el.id, { group, el })
      } else if (hit.el !== el || editingChanged || this.lastHidden !== hiddenMode || pageChanged) {
        syncElement(hit.group, el, ctx)
        hit.el = el
      }
      this.nodes.get(el.id)!.group.zIndex(i + 1)
    })
    for (const [id, hit] of this.nodes) {
      if (!seen.has(id)) {
        hit.group.destroy()
        this.nodes.delete(id)
      }
    }
    this.lastHidden = hiddenMode
    if (pageChanged || sizeChanged) {
      if (s.autoFit) this.fit()
      else this.applyView()
    }
    this.updateTransformer()
    this.pageLayer.batchDraw()
  }

  /** Redraw everything, e.g. after an image or font finished loading. */
  refreshAll() {
    if (!this.page) return
    const s = useEditor.getState()
    const ctx = { editingId: s.editingId, showHidden: canEdit(s.role), pixelRatio: Math.min(2, this.view.zoom * devicePixelRatio), motion: this.motion }
    if (this.bg) {
      this.bg.destroy()
      this.bg = backgroundNode(this.page)
      this.pageGroup.add(this.bg)
      this.bg.moveToBottom()
    }
    for (const { group, el } of this.nodes.values()) syncElement(group, el, ctx)
    this.transformer.forceUpdate()
    this.pageLayer.batchDraw()
  }

  /** Animation preview: draw every element through `fn` until it's set back to null. */
  setMotion(fn: RenderCtx['motion'] | null) {
    this.motion = fn ?? undefined
    this.uiLayer.visible(!fn)
    const s = useEditor.getState()
    const ctx = { editingId: s.editingId, showHidden: canEdit(s.role), pixelRatio: Math.min(2, this.view.zoom * devicePixelRatio), motion: this.motion }
    for (const { group, el } of this.nodes.values()) if (el.anim) syncElement(group, el, ctx)
    this.pageLayer.batchDraw()
    this.uiLayer.batchDraw()
  }

  private onFontsLoaded = () => {
    // Font metrics changed, so text boxes may need a new height.
    const s = useEditor.getState()
    if (!this.page || !s.doc || !canEdit(s.role)) return this.refreshAll()
    const fixes: Array<[string, Partial<DesignElement>]> = []
    for (const el of this.page.elements) {
      if (el.type !== 'text' || el.curve) continue
      const h = measureTextHeight(el)
      if (Math.abs(h - el.height) > 1) fixes.push([el.id, { height: h }])
    }
    if (fixes.length) s.doc.updateMany(fixes, 'layout')
    this.refreshAll()
  }

  updateTransformer() {
    const s = useEditor.getState()
    const els = s.selection.map((id) => this.nodes.get(id)).filter(Boolean) as Array<{ group: Konva.Group; el: DesignElement }>
    const editable = canEdit(s.role)
    if (s.editingId || s.cropId || !editable) {
      this.transformer.nodes(editable ? [] : [])
      if (!editable && els.length) {
        this.transformer.nodes(els.map((e) => e.group))
        this.transformer.setAttrs({ resizeEnabled: false, rotateEnabled: false })
      }
      this.uiLayer.batchDraw()
      return
    }
    this.transformer.nodes(els.map((e) => e.group))
    const locked = els.some((e) => e.el.locked)
    const single = els.length === 1 ? els[0].el : null
    let anchors = ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right']
    if (single?.type === 'text') anchors = single.curve ? ['top-left', 'top-right', 'bottom-left', 'bottom-right'] : ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right']
    if (single?.type === 'line') anchors = ['middle-left', 'middle-right']
    if (els.length > 1) anchors = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
    this.transformer.setAttrs({
      enabledAnchors: anchors,
      resizeEnabled: !locked,
      rotateEnabled: !locked,
      keepRatio: true,
      borderDash: locked ? [4, 4] : undefined,
    })
    this.uiLayer.batchDraw()
  }

  // Interaction

  private elementAt(target: Konva.Node | null): DesignElement | null {
    let n: Konva.Node | null = target
    while (n && n !== this.pageGroup) {
      if (n.name() === 'element') return this.nodes.get(n.id())?.el ?? null
      n = n.getParent()
    }
    return null
  }

  private isTransformerPart(target: Konva.Node) {
    let n: Konva.Node | null = target
    while (n) {
      if (n === this.transformer) return true
      n = n.getParent()
    }
    return false
  }

  private bindEvents() {
    const stage = this.stage

    stage.on('pointerdown', (e) => {
      const evt = e.evt as PointerEvent
      if (evt.button === 2) return
      // hold space or use the middle button to drag the view around
      if (evt.button === 1 || this.space) {
        evt.preventDefault()
        this.panning = { x: evt.clientX, y: evt.clientY }
        this.stage.container().style.cursor = 'grabbing'
        window.addEventListener('pointermove', this.onWindowMove)
        window.addEventListener('pointerup', this.onWindowUp)
        return
      }
      if (this.isTransformerPart(e.target)) {
        // Dragging inside the selection box moves the selection, even over empty space.
        if (e.target.name() === 'back') this.startDrag()
        return
      }
      const s = useEditor.getState()
      const p = this.pointer()
      if (this.onStagePointer?.(p.x, p.y, evt)) return
      if (s.editingId) useEditor.setState({ editingId: null })
      const el = this.elementAt(e.target)
      if (!el) {
        this.marquee = { start: p, additive: evt.shiftKey ? s.selection : [] }
        if (!evt.shiftKey) s.select([])
        window.addEventListener('pointermove', this.onWindowMove)
        window.addEventListener('pointerup', this.onWindowUp)
        return
      }
      if (evt.shiftKey || evt.metaKey) {
        if (s.selection.includes(el.id)) {
          const drop = (id: string) => id === el.id || (!!el.groupId && this.nodes.get(id)?.el.groupId === el.groupId)
          s.set({ selection: s.selection.filter((id) => !drop(id)) })
        } else {
          s.select([...s.selection, el.id])
        }
        return
      }
      if (!s.selection.includes(el.id)) s.select([el.id])
      this.startDrag()
    })

    stage.on('dblclick dbltap', (e) => {
      const el = this.elementAt(e.target)
      if (el) this.onDblClick?.(el)
    })

    stage.on('contextmenu', (e) => {
      e.evt.preventDefault()
      const el = this.elementAt(e.target)
      const s = useEditor.getState()
      if (el && !s.selection.includes(el.id)) s.select([el.id])
      this.onContext?.(e.evt.clientX, e.evt.clientY)
    })

    stage.on('pointermove', (e) => {
      if (this.drag || this.marquee) return
      const el = this.elementAt(e.target)
      const s = useEditor.getState()
      if (el && !s.selection.includes(el.id) && !el.hidden) {
        const pts = corners(el).map((c) => ({ x: c.x * this.view.zoom + this.view.panX, y: c.y * this.view.zoom + this.view.panY }))
        this.hover.setAttrs({ points: pts.flatMap((c) => [c.x, c.y]), visible: true })
      } else {
        this.hover.visible(false)
      }
      this.uiLayer.batchDraw()
    })
    stage.on('pointerleave', () => {
      this.hover.visible(false)
      this.uiLayer.batchDraw()
    })

    stage.on('wheel', (e) => {
      e.evt.preventDefault()
      const evt = e.evt as WheelEvent
      if (evt.ctrlKey || evt.metaKey) {
        const factor = Math.exp(-evt.deltaY * 0.01)
        const z = Math.min(8, Math.max(0.05, this.view.zoom * factor))
        this.zoomTo(z, stage.getPointerPosition() ?? undefined)
        useEditor.setState({ zoom: z, autoFit: false })
      } else {
        this.pan(evt.shiftKey ? evt.deltaY : evt.deltaX, evt.shiftKey ? 0 : evt.deltaY)
      }
    })

    this.transformer.on('transformstart', () => {
      this.hover.visible(false)
      const anchor = this.transformer.getActiveAnchor()
      const nodes = this.transformer.nodes()
      this.transformingText = nodes.length === 1 && nodes[0].getAttr('elType') === 'text' && (anchor === 'middle-left' || anchor === 'middle-right')
    })
    this.transformer.on('transform', () => {
      if (!this.transformingText) return
      // Side handles on text change the wrap width, they don't stretch the letters.
      const node = this.transformer.nodes()[0] as Konva.Group
      const hit = this.nodes.get(node.id())
      if (!hit || hit.el.type !== 'text') return
      const width = Math.max(hit.el.fontSize, node.width() * node.scaleX())
      node.scaleX(1)
      const live = { ...hit.el, width, x: node.x(), y: node.y() } as TextElement
      live.height = measureTextHeight(live)
      syncElement(node, live, { showHidden: true })
      node.setAttrs({ x: live.x, y: live.y })
    })
    this.transformer.on('transformend', () => this.commitTransform())
  }

  private startDrag() {
    const s = useEditor.getState()
    if (!canEdit(s.role)) return
    const els = s.selection.map((id) => this.nodes.get(id)?.el).filter((e): e is DesignElement => !!e && !e.locked)
    if (!els.length) return
    this.drag = {
      start: this.pointer(),
      orig: new Map(els.map((e) => [e.id, { x: e.x, y: e.y }])),
      box: bounds(els),
      moved: false,
    }
    window.addEventListener('pointermove', this.onWindowMove)
    window.addEventListener('pointerup', this.onWindowUp)
  }

  private onSpace = (ev: KeyboardEvent) => {
    if (ev.code !== 'Space') return
    const t = ev.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.isContentEditable)) return
    const down = ev.type === 'keydown'
    if (down) ev.preventDefault()
    if (this.space === down) return
    this.space = down
    if (!this.panning) this.stage.container().style.cursor = down ? 'grab' : ''
  }

  private onWindowMove = (ev: PointerEvent) => {
    if (this.panning) {
      this.pan(this.panning.x - ev.clientX, this.panning.y - ev.clientY)
      this.panning = { x: ev.clientX, y: ev.clientY }
      return
    }
    const rect = this.stage.container().getBoundingClientRect()
    const p = this.toPage(ev.clientX - rect.left, ev.clientY - rect.top)
    if (this.marquee) {
      const m = this.marquee
      const x = Math.min(m.start.x, p.x)
      const y = Math.min(m.start.y, p.y)
      const w = Math.abs(p.x - m.start.x)
      const h = Math.abs(p.y - m.start.y)
      const z = this.view.zoom
      this.marqueeRect.setAttrs({ x: x * z + this.view.panX, y: y * z + this.view.panY, width: w * z, height: h * z, visible: w * z > 3 || h * z > 3 })
      this.uiLayer.batchDraw()
      return
    }
    const d = this.drag
    if (!d) return
    let dx = p.x - d.start.x
    let dy = p.y - d.start.y
    if (!d.moved && Math.hypot(dx, dy) * this.view.zoom < 3) return
    if (!d.moved && this.transformer.nodes().length > 1) {
      // The transformer measures every node it holds on each update, which gets
      // slow with hundreds selected. Everything moves together, so a plain frame will do.
      d.held = this.transformer.nodes()
      this.transformer.nodes([])
      this.dragFrame.visible(true)
    }
    d.moved = true
    this.hover.visible(false)
    if (ev.shiftKey) {
      if (Math.abs(dx) > Math.abs(dy)) dy = 0
      else dx = 0
    }
    const snapped = useEditor.getState().snapping && !ev.altKey ? this.snap(d, dx, dy) : { dx, dy }
    for (const [id, o] of d.orig) {
      const n = this.nodes.get(id)
      n?.group.position({ x: o.x + snapped.dx, y: o.y + snapped.dy })
    }
    if (d.held) {
      const z = this.view.zoom
      this.dragFrame.setAttrs({
        x: (d.box.x + snapped.dx) * z + this.view.panX, y: (d.box.y + snapped.dy) * z + this.view.panY,
        width: d.box.width * z, height: d.box.height * z,
      })
    } else this.transformer.forceUpdate()
    this.pageLayer.batchDraw()
    this.uiLayer.batchDraw()
  }

  private onWindowUp = () => {
    window.removeEventListener('pointermove', this.onWindowMove)
    window.removeEventListener('pointerup', this.onWindowUp)
    if (this.panning) {
      this.panning = null
      this.stage.container().style.cursor = this.space ? 'grab' : ''
      return
    }
    if (this.marquee) {
      const r = this.marqueeRect
      if (r.visible()) {
        const z = this.view.zoom
        const box = { x: (r.x() - this.view.panX) / z, y: (r.y() - this.view.panY) / z, width: r.width() / z, height: r.height() / z }
        const hits = (this.page?.elements ?? [])
          .filter((el) => !el.locked && !el.hidden && intersects(box, bounds([el])))
          .map((el) => el.id)
        useEditor.getState().select([...new Set([...this.marquee.additive, ...hits])])
      }
      r.visible(false)
      this.marquee = null
      this.uiLayer.batchDraw()
      return
    }
    const d = this.drag
    this.drag = null
    this.guides.destroyChildren()
    if (d?.held) {
      this.dragFrame.visible(false)
      this.transformer.nodes(d.held)
    }
    this.uiLayer.batchDraw()
    if (!d?.moved) return
    const patches: Array<[string, Partial<DesignElement>]> = []
    for (const id of d.orig.keys()) {
      const n = this.nodes.get(id)
      if (n) patches.push([id, { x: round(n.group.x()), y: round(n.group.y()) }])
    }
    useEditor.getState().doc?.breakUndo()
    updateElements(patches)
  }

  private snap(d: Drag, dx: number, dy: number) {
    const page = this.page!
    const tol = SNAP_RADIUS / this.view.zoom
    const others = page.elements.filter((e) => !d.orig.has(e.id) && !e.hidden).map((e) => bounds([e]))
    const xs = [0, page.width / 2, page.width, ...others.flatMap((b) => [b.x, b.x + b.width / 2, b.x + b.width])]
    const ys = [0, page.height / 2, page.height, ...others.flatMap((b) => [b.y, b.y + b.height / 2, b.y + b.height])]
    const b = { x: d.box.x + dx, y: d.box.y + dy, width: d.box.width, height: d.box.height }
    const mineX = [b.x, b.x + b.width / 2, b.x + b.width]
    const mineY = [b.y, b.y + b.height / 2, b.y + b.height]
    let bestX: { delta: number; at: number } | null = null
    let bestY: { delta: number; at: number } | null = null
    for (const m of mineX) for (const t of xs) {
      const delta = t - m
      if (Math.abs(delta) <= tol && (!bestX || Math.abs(delta) < Math.abs(bestX.delta))) bestX = { delta, at: t }
    }
    for (const m of mineY) for (const t of ys) {
      const delta = t - m
      if (Math.abs(delta) <= tol && (!bestY || Math.abs(delta) < Math.abs(bestY.delta))) bestY = { delta, at: t }
    }
    this.guides.destroyChildren()
    const sw = 1 / this.view.zoom
    if (bestX) {
      dx += bestX.delta
      this.guides.add(new Konva.Line({ points: [bestX.at, 0, bestX.at, page.height], stroke: '#e5487a', strokeWidth: sw, dash: [4 * sw, 4 * sw] }))
    }
    if (bestY) {
      dy += bestY.delta
      this.guides.add(new Konva.Line({ points: [0, bestY.at, page.width, bestY.at], stroke: '#e5487a', strokeWidth: sw, dash: [4 * sw, 4 * sw] }))
    }
    return { dx, dy }
  }

  private commitTransform() {
    const s = useEditor.getState()
    const anchor = this.transformer.getActiveAnchor() ?? ''
    const sideOnly = anchor.startsWith('middle') || anchor.endsWith('center')
    const patches: Array<[string, Partial<DesignElement>]> = []
    for (const node of this.transformer.nodes()) {
      const hit = this.nodes.get(node.id())
      if (!hit) continue
      const el = hit.el
      const sx = node.scaleX()
      const sy = node.scaleY()
      node.scale({ x: 1, y: 1 })
      const base = { x: round(node.x()), y: round(node.y()), rotation: round(node.rotation(), 100) % 360 }
      let patch: Partial<DesignElement>
      if (el.type === 'text') {
        if (this.transformingText) {
          patch = { ...base, width: round(node.width()) }
        } else {
          patch = { ...base, fontSize: round(el.fontSize * sx, 10), width: round(el.width * sx) }
        }
      } else if (el.type === 'line') {
        patch = { ...base, width: round(el.width * sx) }
      } else if (el.type === 'image' && sideOnly) {
        patch = { ...base, width: round(el.width * sx), height: round(el.height * sy), crop: undefined }
      } else {
        patch = { ...base, width: round(el.width * sx), height: round(el.height * sy) }
      }
      patches.push([el.id, withTextLayout(el, patch)])
    }
    this.transformingText = false
    s.doc?.breakUndo()
    updateElements(patches)
  }

  /** Screen rect of an element, for overlays like the text editor. */
  screenBox(el: Box) {
    const z = this.view.zoom
    return { x: el.x * z + this.view.panX, y: el.y * z + this.view.panY, width: el.width * z, height: el.height * z, zoom: z }
  }

  selectionScreenBounds(): { x: number; y: number; width: number; height: number } | null {
    const nodes = this.transformer.nodes()
    if (!nodes.length) return null
    return this.transformer.getClientRect()
  }

  toDataURL(pixelRatio = 1): string | null {
    if (!this.page) return null
    return this.pageGroup.toDataURL({
      x: this.view.panX, y: this.view.panY,
      width: this.page.width * this.view.zoom, height: this.page.height * this.view.zoom,
      pixelRatio: pixelRatio / this.view.zoom,
    })
  }
}

function round(v: number, p = 1) {
  return Math.round(v * p) / p
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}
