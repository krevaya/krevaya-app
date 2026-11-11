// The design document. Stored in Yjs (see store.ts); backend/app/docmodel.py
// reads and writes the same shape, so change both together.

export type ColorStop = { offset: number; color: string }

export type Fill =
  | { type: 'solid'; color: string }
  | { type: 'linear'; angle: number; stops: ColorStop[] }
  | { type: 'radial'; stops: ColorStop[] }
  | { type: 'image'; src: string; fit?: 'cover' | 'contain' | 'tile' }

export type Shadow = { color: string; blur: number; x: number; y: number; opacity: number }

export type AnimPhase = 'enter' | 'exit' | 'emphasis'
export type AnimRef = { name: string; duration?: number; delay?: number; direction?: string }

export type ElementBase = {
  id: string
  type: string
  name?: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  opacity: number
  locked?: boolean
  hidden?: boolean
  flipX?: boolean
  flipY?: boolean
  groupId?: string
  /** Names the element as a slot that copies can swap out, e.g. "guest_name". */
  slot?: string
  /** What older documents called `slot`; read it, don't write it. */
  key?: string
  shadow?: Shadow
  blend?: string
  link?: string
  anim?: Partial<Record<AnimPhase, AnimRef>>
}

export type TextEffect =
  | { type: 'none' }
  | { type: 'shadow'; color: string; blur: number; offset: number; angle: number; opacity: number }
  | { type: 'lift'; intensity: number }
  | { type: 'hollow'; thickness: number }
  | { type: 'outline'; color: string; thickness: number }
  | { type: 'splice'; color: string; thickness: number; offset: number; angle: number }
  | { type: 'echo'; color: string; offset: number; angle: number }
  | { type: 'glitch'; offset: number; angle: number; colorA: string; colorB: string }
  | { type: 'neon'; intensity: number }
  | { type: 'glow'; color: string; blur: number }
  | { type: 'background'; color: string; roundness: number; spread: number; opacity: number }

export type TextElement = ElementBase & {
  type: 'text'
  text: string
  fontFamily: string
  fontSize: number
  fontWeight: number
  italic?: boolean
  underline?: boolean
  strike?: boolean
  uppercase?: boolean
  align: 'left' | 'center' | 'right' | 'justify'
  lineHeight: number
  letterSpacing: number
  color: string
  gradient?: Fill
  list?: 'none' | 'bullet' | 'number'
  /** -100..100, 0 means straight. */
  curve?: number
  effect?: TextEffect
  role?: 'heading' | 'subheading' | 'body'
}

export type ShapeKind =
  | 'rect' | 'rounded' | 'ellipse' | 'triangle' | 'right-triangle' | 'diamond' | 'pentagon'
  | 'hexagon' | 'octagon' | 'star' | 'star-6' | 'burst' | 'heart' | 'arrow-right' | 'arrow-left'
  | 'arrow-up' | 'arrow-down' | 'chevron' | 'cross' | 'speech' | 'cloud' | 'parallelogram'
  | 'trapezoid' | 'ring' | 'half-circle' | 'blob' | 'arch' | 'tag'

export type ShapeElement = ElementBase & {
  type: 'shape'
  shape: ShapeKind
  fill: Fill
  stroke?: string
  strokeWidth?: number
  strokeDash?: 'solid' | 'dashed' | 'dotted'
  radius?: number
}

export type LineHead = 'none' | 'arrow' | 'triangle' | 'circle' | 'square' | 'bar' | 'diamond'

export type LineElement = ElementBase & {
  type: 'line'
  // x, y is the start point; width is the length; rotation is the angle.
  stroke: string
  strokeWidth: number
  dash?: 'solid' | 'dashed' | 'dotted'
  startHead: LineHead
  endHead: LineHead
  rounded?: boolean
}

export type ImageFilters = {
  preset?: string
  brightness?: number // -100..100
  contrast?: number
  saturation?: number
  hue?: number // -180..180
  blur?: number // 0..40
  temperature?: number
  vignette?: number // 0..100
  grayscale?: boolean
  sepia?: boolean
  invert?: boolean
  pixelate?: number
  noise?: number
}

export type MaskShape = ShapeKind | 'none'

export type ImageElement = ElementBase & {
  type: 'image'
  src: string
  assetId?: string
  naturalWidth: number
  naturalHeight: number
  /** Visible part of the source, in source pixels. */
  crop?: { x: number; y: number; width: number; height: number }
  filters?: ImageFilters
  mask?: MaskShape
  radius?: number
  stroke?: string
  strokeWidth?: number
  /** Placeholder frames in templates show this until a photo is dropped in. */
  placeholder?: boolean
}

export type SvgKind = 'icon' | 'emoji' | 'illustration' | 'sticker' | 'qr'

export type SvgElement = ElementBase & {
  type: 'svg'
  kind: SvgKind
  svg: string
  /** Original color -> replacement. Icons use "currentColor". */
  colors?: Record<string, string>
  qr?: { value: string; fg: string; bg: string; level: 'L' | 'M' | 'Q' | 'H' }
}

export type DesignElement = TextElement | ShapeElement | LineElement | ImageElement | SvgElement

export type Transition = { name: string; duration: number; direction?: string }

export type Page = {
  id: string
  name?: string
  width: number
  height: number
  background: Fill
  notes?: string
  /** How long the page shows in present mode and video, in ms. */
  duration?: number
  transition?: Transition | null
  elements: DesignElement[]
}

export type AudioTrack = {
  id: string
  kind: 'loop' | 'sfx' | 'upload' | 'voice' | 'freesound'
  name: string
  /** Built-in sounds use a `bed:` or `cue:` ref (see audio/builtin.ts); everything else a URL. */
  preset?: string
  src?: string
  start: number // ms on the design timeline
  offset?: number // ms into the clip
  duration?: number // ms, empty = to the end (or the design, for loops)
  volume: number // 0..1
  fadeIn?: number
  fadeOut?: number
  loop?: boolean
}

export type DesignSettings = {
  audio?: AudioTrack[]
  brandKitId?: string
}

export type DesignDoc = {
  pages: Page[]
  settings: DesignSettings
}

export const DEFAULT_PAGE_DURATION = 5000
