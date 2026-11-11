import { clamp01, ease, type Easing } from './easing'
import { glide, sampleAll, type Track } from './tracks'

// Page changes: how the outgoing page gives way to the incoming one. Each page
// gets its own keyframe tracks plus an optional window (the part of it that
// shows). The player turns those into a Scene, a bottom-to-top list of sheets,
// which the canvas painter, the Konva stage and the panel swatches all draw.

/** The visible part of a page, in percent of the page. */
export type Window =
  | { kind: 'band'; l: number; t: number; r: number; b: number }
  /** A round opening; `reach` is a percentage of half the page diagonal. */
  | { kind: 'spot'; x: number; y: number; reach: number }
  | { kind: 'shape'; pts: ReadonlyArray<readonly [number, number]> }

export type Side = 'outgoing' | 'incoming'

/** One page partway through a change. Shifts are percent of the page, zoom is about its center. */
export type Sheet = {
  side: Side
  alpha: number
  shiftX: number
  shiftY: number
  zoomX: number
  zoomY: number
  window: Window | null
}

export type Scene = {
  /** Color behind both pages. */
  matte: string
  /** Bottom first. A page that can't be seen is left out. */
  sheets: Sheet[]
}

type SheetChannel = 'alpha' | 'shiftX' | 'shiftY' | 'zoom' | 'zoomX' | 'zoomY'
type SheetTracks = Partial<Record<SheetChannel, Track<null>>>

export type Family = 'Slide' | 'Push' | 'Reveal' | 'Depth' | 'Blend'

export type PageChange = {
  id: string
  label: string
  family: Family
  /** Default length, ms. */
  ms: number
  curve: Easing
  outgoing?: SheetTracks
  incoming?: SheetTracks
  windows?: Partial<Record<Side, (k: number) => Window | null>>
  /** Which page is drawn on top at eased progress `k`. The incoming one unless set. */
  ontop?: (k: number) => Side
  matte?: string
}

export const FAMILIES: Family[] = ['Slide', 'Push', 'Reveal', 'Depth', 'Blend']

const sheet = (side: Side, tracks: SheetTracks | undefined, k: number, window: Window | null): Sheet => {
  const v = tracks ? sampleAll(tracks, k, null) : {}
  const zoom = v.zoom ?? 1
  return {
    side,
    alpha: clamp01(v.alpha ?? 1),
    shiftX: v.shiftX ?? 0,
    shiftY: v.shiftY ?? 0,
    zoomX: zoom * (v.zoomX ?? 1),
    zoomY: zoom * (v.zoomY ?? 1),
    window,
  }
}

export const restingSheet = (side: Side = 'incoming'): Sheet => sheet(side, undefined, 1, null)

/** The scene `progress` (0..1, linear time) into a change. Without one, just the incoming page. */
export function sceneOf(change: PageChange | undefined, progress: number): Scene {
  if (!change) return { matte: '#000000', sheets: [restingSheet()] }
  const k = change.curve(clamp01(progress))
  const out = sheet('outgoing', change.outgoing, k, change.windows?.outgoing?.(k) ?? null)
  const inc = sheet('incoming', change.incoming, k, change.windows?.incoming?.(k) ?? null)
  const order = (change.ontop?.(k) ?? 'incoming') === 'incoming' ? [out, inc] : [inc, out]
  return { matte: change.matte ?? '#000000', sheets: order.filter((s) => s.alpha > 0) }
}

// --- drawing helpers shared by every renderer ---

/** The path calls a window needs; CanvasRenderingContext2D and Konva's context both have them. */
export type Pen = {
  moveTo(x: number, y: number): void
  lineTo(x: number, y: number): void
  arc(x: number, y: number, r: number, start: number, end: number): void
  closePath(): void
}

/**
 * Trace a window on a w x h page. `place` maps page px into the drawing space and
 * `stretch` scales radii, for renderers that clip inside a transformed group.
 */
export function traceWindow(pen: Pen, win: Window, w: number, h: number, place = (x: number, y: number) => [x, y], stretch = 1) {
  const px = (x: number, y: number) => place((x / 100) * w, (y / 100) * h)
  const poly = (pts: ReadonlyArray<readonly [number, number]>) => {
    pts.forEach(([x, y], i) => {
      const [a, b] = px(x, y)
      if (i) pen.lineTo(a, b)
      else pen.moveTo(a, b)
    })
    pen.closePath()
  }
  if (win.kind === 'band') {
    const r = Math.max(win.l, win.r)
    const b = Math.max(win.t, win.b)
    poly([[win.l, win.t], [r, win.t], [r, b], [win.l, b]])
  } else if (win.kind === 'shape') {
    poly(win.pts)
  } else {
    const [cx, cy] = px(win.x, win.y)
    const r = (Math.max(0, win.reach) / 100) * (Math.hypot(w, h) / 2) * stretch
    pen.moveTo(cx + r, cy)
    pen.arc(cx, cy, r, 0, Math.PI * 2)
  }
}

/** An SVG path string for a window, for CSS clip-path on the swatches. */
export function windowPath(win: Window, w: number, h: number): string {
  let d = ''
  traceWindow({
    moveTo: (x, y) => (d += `M${x} ${y}`),
    lineTo: (x, y) => (d += `L${x} ${y}`),
    closePath: () => (d += 'Z'),
    arc: (cx, cy, r) => (d += `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`),
  }, win, w, h)
  return d
}

// --- the list, by family ---

const pc = (c: PageChange) => c
const enterFrom = (axis: 'shiftX' | 'shiftY', from: number): SheetTracks => ({ [axis]: glide(from, 0) })
const leaveTo = (axis: 'shiftX' | 'shiftY', to: number): SheetTracks => ({ [axis]: glide(0, to) })
const dip = (id: string, label: string, matte: string) => pc({
  id, label, family: 'Blend', ms: 1300, curve: ease.inOutSine, matte,
  outgoing: { alpha: (k) => 1 - 2 * k },
  incoming: { alpha: (k) => 2 * k - 1 },
})
const firstHalf = (k: number): Side => (k < 0.5 ? 'outgoing' : 'incoming')

export const PAGE_CHANGES: PageChange[] = [
  pc({ id: 'slide-left', label: 'Slide left', family: 'Slide', ms: 620, curve: ease.inOutCubic, incoming: enterFrom('shiftX', 100) }),
  pc({ id: 'slide-right', label: 'Slide right', family: 'Slide', ms: 620, curve: ease.inOutCubic, incoming: enterFrom('shiftX', -100) }),
  pc({ id: 'slide-up', label: 'Slide up', family: 'Slide', ms: 620, curve: ease.inOutCubic, incoming: enterFrom('shiftY', 100) }),
  pc({ id: 'slide-down', label: 'Slide down', family: 'Slide', ms: 620, curve: ease.inOutCubic, incoming: enterFrom('shiftY', -100) }),

  pc({ id: 'push-left', label: 'Push left', family: 'Push', ms: 850, curve: ease.inOutCubic, outgoing: leaveTo('shiftX', -100), incoming: enterFrom('shiftX', 100) }),
  pc({ id: 'push-right', label: 'Push right', family: 'Push', ms: 850, curve: ease.inOutCubic, outgoing: leaveTo('shiftX', 100), incoming: enterFrom('shiftX', -100) }),
  pc({ id: 'push-up', label: 'Push up', family: 'Push', ms: 850, curve: ease.inOutCubic, outgoing: leaveTo('shiftY', -100), incoming: enterFrom('shiftY', 100) }),
  pc({ id: 'push-down', label: 'Push down', family: 'Push', ms: 850, curve: ease.inOutCubic, outgoing: leaveTo('shiftY', 100), incoming: enterFrom('shiftY', -100) }),

  pc({ id: 'wipe-left', label: 'Wipe left', family: 'Reveal', ms: 650, curve: ease.inOutCubic, windows: { incoming: (k) => ({ kind: 'band', l: 100 * (1 - k), t: 0, r: 100, b: 100 }) } }),
  pc({ id: 'wipe-right', label: 'Wipe right', family: 'Reveal', ms: 650, curve: ease.inOutCubic, windows: { incoming: (k) => ({ kind: 'band', l: 0, t: 0, r: 100 * k, b: 100 }) } }),
  pc({
    id: 'split', label: 'Split', family: 'Reveal', ms: 900, curve: ease.inOutCubic,
    outgoing: { alpha: glide(1, 0.5), zoom: glide(1, 0.96) },
    windows: { incoming: (k) => ({ kind: 'band', l: 50 - 50 * k, t: 0, r: 50 + 50 * k, b: 100 }) },
  }),
  // a triangle grows from the top-left corner; its edge clears the far corner at k = 1
  pc({
    id: 'diagonal', label: 'Diagonal', family: 'Reveal', ms: 900, curve: ease.inOutCubic,
    windows: { incoming: (k) => (k >= 1 ? null : { kind: 'shape', pts: [[0, 0], [200 * k, 0], [0, 200 * k]] }) },
  }),
  pc({ id: 'circle', label: 'Circle', family: 'Reveal', ms: 1100, curve: ease.inOutCubic, windows: { incoming: (k) => ({ kind: 'spot', x: 50, y: 50, reach: 100 * k }) } }),
  // the old page shrinks to a pinhole, then the new one opens out of it
  pc({
    id: 'pinhole', label: 'Pinhole', family: 'Reveal', ms: 1100, curve: ease.linear, ontop: firstHalf,
    outgoing: { alpha: (k) => (k < 0.5 ? 1 : 0) },
    incoming: { alpha: (k) => (k < 0.5 ? 0 : 1) },
    windows: {
      outgoing: (k) => ({ kind: 'spot', x: 50, y: 50, reach: 100 * (1 - ease.inCubic(Math.min(1, k * 2))) }),
      incoming: (k) => ({ kind: 'spot', x: 50, y: 50, reach: 100 * ease.outCubic(Math.max(0, k * 2 - 1)) }),
    },
  }),

  pc({
    id: 'zoom', label: 'Zoom', family: 'Depth', ms: 650, curve: ease.inOutCubic,
    outgoing: { zoom: glide(1, 1.1) }, incoming: { alpha: glide(0, 1), zoom: glide(0.92, 1) },
  }),
  pc({
    id: 'warp', label: 'Warp', family: 'Depth', ms: 900, curve: ease.inOutCubic, ontop: () => 'outgoing',
    outgoing: { zoom: glide(1, 3), alpha: (k) => 1 - 2.2 * k },
    incoming: { zoom: glide(0.6, 1), alpha: (k) => 1.8 * k - 0.35 },
  }),
  // the new page lands on top like a card, the old one sinks back
  pc({
    id: 'stack', label: 'Stack', family: 'Depth', ms: 800, curve: ease.outCubic,
    outgoing: { zoom: glide(1, 0.9), alpha: glide(1, 0.4) },
    incoming: { shiftY: glide(25, 0), alpha: (k) => 2.5 * k },
  }),
  pc({
    id: 'flip', label: 'Flip', family: 'Depth', ms: 750, curve: ease.inOutSine, matte: '#000000', ontop: firstHalf,
    outgoing: { alpha: (k) => (k < 0.5 ? 1 : 0), zoomX: (k) => Math.max(0.001, Math.cos(Math.PI * k)) },
    incoming: { alpha: (k) => (k < 0.5 ? 0 : 1), zoomX: (k) => Math.max(0.001, -Math.cos(Math.PI * k)) },
  }),

  pc({ id: 'fade', label: 'Fade', family: 'Blend', ms: 560, curve: ease.inOutSine, incoming: { alpha: glide(0, 1) } }),
  dip('dip-black', 'Dip to black', '#000000'),
  dip('dip-white', 'Dip to white', '#ffffff'),
]

export const pageChange = (name: string | undefined) => (name ? PAGE_CHANGES.find((c) => c.id === name) : undefined)
