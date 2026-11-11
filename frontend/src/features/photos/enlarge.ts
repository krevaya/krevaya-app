// Photo enlarging, done on separate R, G, B and A planes.
//
// 1. A Catmull-Rom pass makes the first guess.
// 2. Back-projection: shrink the guess, see how far it is from the original, grow
//    the difference and add it on. A couple of rounds bring back detail.
// 3. A light sharpen where there are edges.
// 4. A soft limiter pulls values that stray past the 3x3 source neighborhood back
//    toward it, so cubic overshoot can't turn into halos.
//
// Color stays straight (not premultiplied). When color is resampled each tap is
// weighted by its alpha as well as the kernel, so a transparent pixel adds nothing,
// whatever color happens to be stored under it.

export type Rgba = { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> }

type Plane = Float32Array | Uint8ClampedArray
type Taps = { start: Int32Array; k: Float32Array; n: number }

// below this summed alpha (0..255 scale) a color sample has nothing to go on
const NO_ALPHA = 0.5
// how far past the neighborhood range the limiter lets a value creep, in levels
const KNEE = 3

function cubic(t: number) {
  const x = Math.abs(t)
  if (x >= 2) return 0
  return x < 1 ? (3 * x - 5) * x * x / 2 + 1 : ((-x + 5) * x - 8) * x / 2 + 2
}

function growTaps(from: number, to: number): Taps {
  const n = 4
  const start = new Int32Array(to)
  const k = new Float32Array(to * n)
  for (let o = 0; o < to; o++) {
    const center = ((o + 0.5) * from) / to - 0.5
    const s = Math.floor(center) - 1
    start[o] = s
    let total = 0
    for (let j = 0; j < n; j++) total += k[o * n + j] = cubic(center - s - j)
    for (let j = 0; j < n; j++) k[o * n + j] /= total
  }
  return { start, k, n }
}

/** Box filter for going back down: each output covers `from / to` inputs, partly at the ends. */
function shrinkTaps(from: number, to: number): Taps {
  const span = from / to
  const n = Math.ceil(span) + 1
  const start = new Int32Array(to)
  const k = new Float32Array(to * n)
  for (let o = 0; o < to; o++) {
    const lo = o * span
    const s = Math.floor(lo)
    start[o] = s
    for (let j = 0; j < n; j++) {
      const overlap = Math.min(lo + span, s + j + 1) - Math.max(lo, s + j)
      k[o * n + j] = overlap > 0 ? overlap / span : 0
    }
  }
  return { start, k, n }
}

const edge = (i: number, size: number) => (i < 0 ? 0 : i >= size ? size - 1 : i)

/**
 * Resizes one plane with separable taps. With `alpha`, each tap also counts for its
 * alpha (normalized convolution), so color comes only from pixels you can see.
 * With `add`, the result is added onto `out` instead of replacing it.
 */
function resize(
  src: Plane, sw: number, sh: number, out: Plane, dw: number, dh: number,
  tx: Taps, ty: Taps, opts: { alpha?: Plane; add?: boolean } = {},
) {
  const { alpha, add } = opts
  const sum = new Float32Array(dw * sh)
  const cover = alpha ? new Float32Array(dw * sh) : null
  for (let y = 0; y < sh; y++) {
    const row = y * sw
    for (let x = 0; x < dw; x++) {
      let v = 0, c = 0
      for (let j = 0; j < tx.n; j++) {
        const kw = tx.k[x * tx.n + j]
        if (kw === 0) continue
        const i = row + edge(tx.start[x] + j, sw)
        if (alpha) {
          const wa = kw * alpha[i]
          v += wa * src[i]
          c += wa
        } else v += kw * src[i]
      }
      sum[y * dw + x] = v
      if (cover) cover[y * dw + x] = c
    }
  }
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      let v = 0, c = 0
      for (let j = 0; j < ty.n; j++) {
        const kw = ty.k[y * ty.n + j]
        if (kw === 0) continue
        const i = edge(ty.start[y] + j, sh) * dw + x
        v += kw * sum[i]
        if (cover) c += kw * cover[i]
      }
      if (cover) v = c > NO_ALPHA ? v / c : 0
      const o = y * dw + x
      out[o] = add ? out[o] + v : v
    }
  }
}

/** Splits interleaved RGBA into four planes. */
function split(d: Uint8ClampedArray, n: number): Float32Array[] {
  const p = [0, 1, 2, 3].map(() => new Float32Array(n))
  for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) p[c][i] = d[i * 4 + c]
  return p
}

/** Adds detail back where the gradient says there's an edge; flat and noisy-flat areas are skipped. */
function sharpen(p: Uint8ClampedArray, w: number, h: number, amount: number) {
  const v = p.slice()
  for (let y = 0; y < h; y++) {
    const up = edge(y - 1, h) * w, mid = y * w, dn = edge(y + 1, h) * w
    for (let x = 0; x < w; x++) {
      const l = edge(x - 1, w), r = edge(x + 1, w)
      const grad = Math.abs(v[mid + r] - v[mid + l]) + Math.abs(v[dn + x] - v[up + x])
      if (grad < 6) continue
      const blur = (v[up + l] + v[up + x] + v[up + r] + v[mid + l] + v[mid + x] + v[mid + r] + v[dn + l] + v[dn + x] + v[dn + r]) / 9
      const gain = amount * Math.min(1, (grad - 6) / 50)
      p[mid + x] = v[mid + x] + (v[mid + x] - blur) * gain
    }
  }
}

/**
 * Lowest and highest value in the 3x3 block around each source pixel. With `seen`,
 * only pixels that aren't fully transparent count; a block with none gets 0..255.
 */
function neighborRange(p: Float32Array, w: number, h: number, seen?: Float32Array) {
  const lo = new Float32Array(w * h)
  const hi = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = Infinity, b = -Infinity
      for (let dy = -1; dy <= 1; dy++) {
        const row = edge(y + dy, h) * w
        for (let dx = -1; dx <= 1; dx++) {
          const i = row + edge(x + dx, w)
          if (seen && seen[i] < 1) continue
          if (p[i] < a) a = p[i]
          if (p[i] > b) b = p[i]
        }
      }
      lo[y * w + x] = a === Infinity ? 0 : a
      hi[y * w + x] = b === -Infinity ? 255 : b
    }
  }
  return { lo, hi }
}

/**
 * Soft limiter: inside the source range a value is left alone; past it, the excess
 * is squashed so it can never get more than KNEE levels beyond.
 */
function limit(p: Uint8ClampedArray, dw: number, dh: number, range: { lo: Float32Array; hi: Float32Array }, sw: number, sh: number) {
  const col = new Int32Array(dw)
  for (let x = 0; x < dw; x++) col[x] = Math.min(sw - 1, Math.floor(((x + 0.5) * sw) / dw))
  for (let y = 0; y < dh; y++) {
    const row = Math.min(sh - 1, Math.floor(((y + 0.5) * sh) / dh)) * sw
    for (let x = 0; x < dw; x++) {
      const o = y * dw + x
      const s = row + col[x]
      const v = p[o]
      if (v > range.hi[s]) {
        const over = v - range.hi[s]
        p[o] = range.hi[s] + (over * KNEE) / (over + KNEE)
      } else if (v < range.lo[s]) {
        const under = range.lo[s] - v
        p[o] = range.lo[s] - (under * KNEE) / (under + KNEE)
      }
    }
  }
}

/** Enlarges `img` to dw x dh. `rounds` is the number of back-projection passes. */
export function enlarge(img: Rgba, dw: number, dh: number, opts: { rounds?: number; sharpen?: number; progress?: (p: number) => void } = {}): Rgba {
  const { width: sw, height: sh } = img
  const rounds = opts.rounds ?? 2
  const report = opts.progress ?? (() => {})
  const total = 2 + rounds
  const sn = sw * sh
  const dn = dw * dh

  const [r, g, b, a] = split(img.data, sn)
  const color = [r, g, b]
  const upX = growTaps(sw, dw)
  const upY = growTaps(sh, dh)

  const est = [0, 1, 2, 3].map(() => new Uint8ClampedArray(dn))
  resize(a, sw, sh, est[3], dw, dh, upX, upY)
  for (let c = 0; c < 3; c++) resize(color[c], sw, sh, est[c], dw, dh, upX, upY, { alpha: a })
  report(1 / total)

  if (rounds > 0) {
    const downX = shrinkTaps(dw, sw)
    const downY = shrinkTaps(dh, sh)
    const low = new Float32Array(sn)
    const lowA = new Float32Array(sn)
    for (let round = 0; round < rounds; round++) {
      resize(est[3], dw, dh, lowA, sw, sh, downX, downY)
      for (let c = 0; c < 3; c++) {
        resize(est[c], dw, dh, low, sw, sh, downX, downY, { alpha: est[3] })
        for (let i = 0; i < sn; i++) low[i] = a[i] > 0 ? color[c][i] - low[i] : 0
        resize(low, sw, sh, est[c], dw, dh, upX, upY, { alpha: a, add: true })
      }
      for (let i = 0; i < sn; i++) lowA[i] = a[i] - lowA[i]
      resize(lowA, sw, sh, est[3], dw, dh, upX, upY, { add: true })
      report((2 + round) / total)
    }
  }

  const amount = opts.sharpen ?? 0.7
  if (amount > 0) for (let c = 0; c < 3; c++) sharpen(est[c], dw, dh, amount)
  for (let c = 0; c < 3; c++) limit(est[c], dw, dh, neighborRange(color[c], sw, sh, a), sw, sh)
  limit(est[3], dw, dh, neighborRange(a, sw, sh), sw, sh)

  const data = new Uint8ClampedArray(dn * 4)
  for (let i = 0; i < dn; i++) {
    const alpha = est[3][i]
    if (alpha === 0) continue
    data[i * 4] = est[0][i]
    data[i * 4 + 1] = est[1][i]
    data[i * 4 + 2] = est[2][i]
    data[i * 4 + 3] = alpha
  }
  report(1)
  return { width: dw, height: dh, data }
}
