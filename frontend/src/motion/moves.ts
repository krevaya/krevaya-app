import type { DesignElement, Page } from '@/doc/schema'
import type { MotionState } from '@/render/konva'
import { bounds, rad } from '@/lib/math'
import { clamp01, ease, type Easing } from './easing'
import { glide, sampleAll, showBy, type Track } from './tracks'

// Element moves. Each one is a set of keyframe tracks over a position 0..1.
// Entrances run from "not here yet" (0) to "as designed" (1). Exits name their
// own curve and run an entrance's tracks in reverse, so they speed up as they
// leave instead of mirroring the arrival. Loops describe one full-strength cycle;
// the player fades their strength in and out.
//
// Distances come from the element itself: `span` is the mean of its width and
// height, so a big headline travels further than a small icon. Slides use the
// room left between the element and the page edge.

/** What a move needs to know about the element it's moving, in page px. */
export type Body = {
  w: number
  h: number
  /** Mean of width and height. */
  span: number
  rotation: number
  /** Distance to travel to clear each page edge. */
  room: { left: number; right: number; up: number; down: number }
  pageH: number
  /** Visible characters, for text-by-text reveals. */
  chars: number
}

/**
 * fade: opacity. x/y: px along the page axes. ox/oy: px along the element's own axes.
 * scale multiplies scaleX/scaleY. turn: degrees. blur: px. left/top/right/bottom: the
 * visible window as fractions of the element.
 */
export type Channel = 'fade' | 'x' | 'y' | 'ox' | 'oy' | 'scale' | 'scaleX' | 'scaleY' | 'turn' | 'blur' | 'left' | 'top' | 'right' | 'bottom'

export type Tracks = Partial<Record<Channel, Track<Body>>>

export type Move = {
  id: string
  label: string
  /** Default length, ms. */
  ms: number
  tracks: Tracks
  /** Play the tracks from 1 back to 0. */
  reverse?: boolean
  /** Time curve applied before sampling; entrances keep theirs on the stops. */
  curve?: Easing
}

export type Loop = Omit<Move, 'reverse' | 'curve'>

const REST: Record<Channel, number> = {
  fade: 1, x: 0, y: 0, ox: 0, oy: 0, scale: 1, scaleX: 1, scaleY: 1, turn: 0, blur: 0, left: 0, top: 0, right: 1, bottom: 1,
}

export function bodyOf(el: Pick<DesignElement, 'x' | 'y' | 'width' | 'height' | 'rotation'> & { type?: string; text?: string }, page: Pick<Page, 'width' | 'height'>): Body {
  const b = bounds([{ ...el, rotation: el.rotation || 0 }])
  return {
    w: el.width,
    h: el.height,
    span: (el.width + el.height) / 2,
    rotation: el.rotation || 0,
    room: { left: b.x + b.width, right: page.width - b.x, up: b.y + b.height, down: page.height - b.y },
    pageH: page.height,
    chars: el.type === 'text' && el.text ? el.text.replace(/\s/g, '').length : 10,
  }
}

const floor = (v: number) => (Math.abs(v) < 0.001 ? (v < 0 ? -0.001 : 0.001) : v)

/** Turn sampled channel values into what the renderer understands. */
export function toMotion(v: Partial<Record<Channel, number>>, body: Body): MotionState {
  const m: MotionState = {}
  if (v.fade !== undefined) m.opacity = clamp01(v.fade)
  if (v.x !== undefined || v.y !== undefined || v.ox !== undefined || v.oy !== undefined) {
    // page-axis travel is turned into the element's rotated frame
    const r = rad(body.rotation)
    const gx = v.x ?? 0
    const gy = v.y ?? 0
    m.dx = gx * Math.cos(r) + gy * Math.sin(r) + (v.ox ?? 0)
    m.dy = -gx * Math.sin(r) + gy * Math.cos(r) + (v.oy ?? 0)
  }
  if (v.scale !== undefined || v.scaleX !== undefined) m.scaleX = floor((v.scale ?? 1) * (v.scaleX ?? 1))
  if (v.scale !== undefined || v.scaleY !== undefined) m.scaleY = floor((v.scale ?? 1) * (v.scaleY ?? 1))
  if (v.turn !== undefined) m.rotation = v.turn
  if (v.blur !== undefined) m.blur = Math.max(0, v.blur)
  if (v.left !== undefined || v.top !== undefined || v.right !== undefined || v.bottom !== undefined) {
    m.clip = [v.left ?? 0, v.top ?? 0, v.right ?? 1, v.bottom ?? 1]
  }
  return m
}

/** How a move looks `t` (0..1, linear time) of the way through. */
export function poseAt(move: Move, t: number, body: Body): MotionState {
  const k = move.curve ? move.curve(clamp01(t)) : clamp01(t)
  return toMotion(sampleAll(move.tracks, move.reverse ? 1 - k : k, body), body)
}

/** A loop at phase `p` (0..1), with its strength scaled by `amount` (0 = as designed). */
export function loopAt(loop: Loop, p: number, amount: number, body: Body): MotionState {
  const v = sampleAll(loop.tracks, p, body)
  for (const k in v) {
    const ch = k as Channel
    v[ch] = REST[ch] + amount * (v[ch]! - REST[ch])
  }
  return toMotion(v, body)
}

// --- entrances ---

const of = (f: number) => (b: Body) => f * b.span
const blurOf = (f: number) => (b: Body) => Math.min(40, Math.max(6, f * b.span))
const pieces = (b: Body) => Math.max(4, Math.min(40, b.chars))

const enter = (id: string, label: string, ms: number, tracks: Tracks): Move => ({ id, label, ms, tracks })

export const ENTRANCES: Move[] = [
  enter('fade', 'Fade', 500, { fade: showBy(1, ease.outQuad) }),
  enter('rise', 'Rise', 620, { y: glide(of(0.22), 0, ease.outCubic), fade: showBy(0.625) }),
  enter('drop', 'Drop', 620, { y: glide(of(-0.22), 0, ease.outCubic), fade: showBy(0.625) }),
  enter('slide-left', 'Slide left', 800, { x: glide((b) => b.room.right, 0, ease.outCubic) }),
  enter('slide-right', 'Slide right', 800, { x: glide((b) => -b.room.left, 0, ease.outCubic) }),
  enter('slide-up', 'Slide up', 800, { y: glide((b) => b.room.down, 0, ease.outCubic) }),
  enter('slide-down', 'Slide down', 800, { y: glide((b) => -b.room.up, 0, ease.outCubic) }),
  enter('pop', 'Pop', 450, { scale: glide(0, 1, ease.outBack), fade: showBy(1 / 3) }),
  enter('zoom-in', 'Zoom in', 700, { scale: glide(0.3, 1, ease.outCubic), fade: showBy(1, ease.outCubic) }),
  enter('zoom-out', 'Zoom out', 700, { scale: glide(1.8, 1, ease.outCubic), fade: showBy(1 / 1.5) }),
  enter('grow', 'Grow', 700, { scaleY: glide(0, 1, ease.outCubic), oy: glide((b) => b.h / 2, 0, ease.outCubic) }),
  enter('spin', 'Spin', 1100, { turn: glide(180, 0, ease.outCubic), scale: glide(0.5, 1, ease.outCubic), fade: showBy(0.35) }),
  enter('flip-x', 'Flip', 700, { scaleX: (t) => Math.sin((ease.outQuad(t) * Math.PI) / 2), fade: showBy(1 / 3) }),
  enter('flip-y', 'Flip up', 700, { scaleY: (t) => Math.sin((ease.outQuad(t) * Math.PI) / 2), fade: showBy(1 / 3) }),
  enter('wipe-left', 'Wipe left', 800, { left: glide(1, 0, ease.inOutCubic) }),
  enter('wipe-right', 'Wipe right', 800, { right: glide(0, 1, ease.inOutCubic) }),
  enter('wipe-up', 'Wipe up', 800, { top: glide(1, 0, ease.inOutCubic) }),
  enter('wipe-down', 'Wipe down', 800, { bottom: glide(0, 1, ease.inOutCubic) }),
  enter('blur-in', 'Blur in', 900, { blur: glide(blurOf(0.086), 0, ease.outCubic), fade: showBy(1, ease.outCubic), scale: glide(1.06, 1, ease.outCubic) }),
  enter('bounce', 'Bounce', 1100, { y: glide((b) => -Math.min(b.room.up, b.pageH * 0.6), 0, ease.outBounce) }),
  enter('elastic', 'Elastic', 1000, { scale: glide(0, 1, ease.outElastic), fade: showBy(0.25) }),
  enter('typewriter', 'Typewriter', 1200, { right: (t, b) => ease.steps(pieces(b))(t) }),
  enter('topple', 'Topple', 1050, {
    y: glide(of(-0.3), 0, ease.outBack), turn: glide(75, 0, ease.outBack), scale: glide(0.4, 1, ease.outBack), fade: showBy(0.5),
  }),
  enter('swing', 'Swing', 1100, { turn: (t) => 35 * (1 - t) ** 2 * Math.cos(t * Math.PI * 3.5), fade: showBy(1 / 3) }),
  enter('float-in', 'Float in', 1400, { y: glide(of(0.11), 0, ease.inOutSine), fade: showBy(1, ease.inOutSine) }),
  enter('stretch', 'Stretch', 700, { scaleX: glide(1.8, 1, ease.outBack), scaleY: glide(0.3, 1, ease.outBack), fade: showBy(0.5) }),
  enter('pan', 'Pan', 1200, { x: glide(of(-0.43), 0, ease.outQuart), fade: showBy(1, ease.outQuart), scale: glide(1.08, 1, ease.outQuart) }),
  // a thin strip widens first, then opens downward
  enter('ribbon', 'Ribbon', 900, {
    scaleX: [[0, 0.02], [0.5, 1, ease.outCubic]],
    scaleY: [[0, 0.04], [0.5, 0.04], [1, 1, ease.outBack]],
    fade: showBy(1 / 6),
  }),
  enter('skate', 'Skate', 900, { x: glide(of(0.79), 0, ease.outBack), turn: glide(14, 0, ease.outBack), fade: showBy(0.4) }),
  enter('haze', 'Haze', 1400, { y: glide(of(0.16), 0, ease.outQuart), blur: glide(blurOf(0.05), 0, ease.outQuart), fade: showBy(1, ease.outQuart) }),
  // grows out of the top-left corner instead of the middle
  enter('corner', 'Corner', 750, {
    scale: glide(0, 1, ease.outQuart), ox: glide((b) => -b.w / 2, 0, ease.outQuart), oy: glide((b) => -b.h / 2, 0, ease.outQuart), fade: showBy(1 / 3),
  }),
  enter('ripple', 'Ripple', 1100, {
    scaleX: (t) => 1 - 0.35 * (1 - t) ** 2 * Math.cos(t * Math.PI * 4),
    scaleY: (t) => 1 + 0.21 * (1 - t) ** 2 * Math.cos(t * Math.PI * 4) - 0.35 * (1 - t) ** 3,
    fade: showBy(0.25),
  }),
  enter('center-wipe', 'Center wipe', 900, { left: glide(0.5, 0, ease.inOutCubic), right: glide(0.5, 1, ease.inOutCubic) }),
  // slides up from behind a line at its bottom edge, like a title card
  enter('reveal', 'Reveal', 950, { oy: glide((b) => b.h, 0, ease.outQuart), bottom: glide(0, 1, ease.outQuart) }),
]

// --- exits ---

// Moves whose timing is the point (steps, wobbles, bounces) keep a straight clock
// when leaving; everything else eases in and out so it doesn't snap away.
const STRAIGHT = new Set(['typewriter', 'swing', 'ripple', 'bounce', 'elastic'])

export const EXITS: Move[] = ENTRANCES.map((m) => ({
  ...m,
  reverse: true,
  curve: STRAIGHT.has(m.id) ? ease.linear : ease.inOutSine,
}))

// --- loops ---
// Position 0 and 1 are the element as designed, so cycles join up without a jump.

function noise(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

const peak = (p: number, at: number, w: number) => Math.exp(-(((p - at) / w) ** 2))
const swell = (p: number) => (1 - Math.cos(2 * Math.PI * p)) / 2
const hop = (p: number) => 4 * p * (1 - p)
const squash = (p: number) => 1 - 0.06 * (peak(p, 0, 0.05) + peak(p, 1, 0.05))
const blinkAt = (p: number) => (p > 0.4 && p < 0.47) || (p > 0.55 && p < 0.62)
const settle = (p: number, until: number, f: (k: number) => number) => (p > until ? 0 : f(p / until))

const loop = (id: string, label: string, ms: number, tracks: Tracks): Loop => ({ id, label, ms, tracks })

export const LOOPS: Loop[] = [
  loop('pulse', 'Pulse', 1200, { scale: (p) => 1 + 0.07 * swell(p) }),
  loop('wiggle', 'Wiggle', 900, { turn: (p) => 5 * Math.sin(4 * Math.PI * p) }),
  loop('shake', 'Shake', 1400, { x: (p, b) => settle(p, 0.4, (k) => 0.029 * b.span * Math.sin(k * Math.PI * 6) * (1 - k)) }),
  loop('flicker', 'Flicker', 1600, {
    fade: (p) => {
      const n = Math.floor(p * 24)
      return n === 0 || noise(n) > 0.3 ? 1 : 0.4 + 0.4 * noise(n + 99)
    },
  }),
  loop('heartbeat', 'Heartbeat', 1300, { scale: (p) => 1 + 0.12 * peak(p, 0.12, 0.05) + 0.08 * peak(p, 0.34, 0.05) }),
  loop('bounce', 'Bounce', 1000, { y: (p, b) => -0.086 * b.span * hop(p), scaleY: squash, scaleX: (p) => 2 - squash(p) }),
  // scaled by strength, so it winds down rather than snapping back when an exit starts
  loop('spin', 'Spin', 2400, { turn: (p) => 360 * ease.inOutCubic(p) }),
  loop('float', 'Float', 3000, { y: (p, b) => -0.036 * b.span * Math.sin(2 * Math.PI * p) }),
  loop('glow', 'Throb', 2000, { fade: (p) => 1 - 0.45 * swell(p) }),
  loop('tilt', 'Tilt', 2400, { turn: (p) => 7 * Math.sin(2 * Math.PI * p) }),
  loop('jelly', 'Jelly', 1100, {
    scaleX: (p) => 1 + settle(p, 0.6, (k) => 0.12 * Math.sin(k * Math.PI * 3) * (1 - k)),
    scaleY: (p) => 1 - settle(p, 0.6, (k) => 0.12 * Math.sin(k * Math.PI * 3) * (1 - k)),
  }),
  loop('blink', 'Blink', 1400, { fade: (p) => (blinkAt(p) ? 0 : 1) }),
  loop('sway', 'Sway', 3200, { x: (p, b) => 0.025 * b.span * Math.sin(2 * Math.PI * p), turn: (p) => 3 * Math.sin(2 * Math.PI * p) }),
  // a quick pop with a small settle, then a rest
  loop('pop', 'Pop', 1800, { scale: (p) => 1 + 0.14 * peak(p, 0.12, 0.045) - 0.04 * peak(p, 0.24, 0.05) }),
  loop('breathe', 'Breathe', 4200, { scale: (p) => 1 + 0.045 * swell(p), fade: (p) => 1 - 0.18 * swell(p) }),
]

const find = <T extends { id: string }>(list: T[], name: string | undefined) => (name ? list.find((d) => d.id === name) : undefined)

export const entranceMove = (name: string | undefined) => find(ENTRANCES, name)
export const exitMove = (name: string | undefined) => find(EXITS, name)
export const loopMove = (name: string | undefined) => find(LOOPS, name)
