import { describe, expect, it } from 'vitest'
import { enlarge, type Rgba } from './enlarge'

type Px = [number, number, number, number]

function paint(w: number, h: number, at: (x: number, y: number) => Px): Rgba {
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) data.set(at(i % w, Math.floor(i / w)), i * 4)
  return { width: w, height: h, data }
}

function channel(img: Rgba, c: number) {
  return Array.from({ length: img.width * img.height }, (_, i) => img.data[i * 4 + c])
}

function psnr(a: number[], b: number[]) {
  const mse = a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0) / a.length
  return 10 * Math.log10((255 * 255) / mse)
}

/** Blocky enlargement, as the baseline anything smarter should beat. */
function blocky(img: Rgba, f: number): Rgba {
  return paint(img.width * f, img.height * f, (x, y) => {
    const i = (Math.floor(y / f) * img.width + Math.floor(x / f)) * 4
    return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]]
  })
}

// soft rings, smooth enough that a 4x4 average of them is a fair "small photo"
const rings = (x: number, y: number, size: number): Px => {
  const v = Math.round(128 + 90 * Math.cos(Math.hypot(x - size / 2, y - size / 2) / (size / 9)))
  return [v, 255 - v, 128, 255]
}

describe('enlarge', () => {
  it.each([
    [7, 5, 14, 10],
    [7, 5, 11, 8],
    [3, 9, 9, 27],
  ])('turns %ix%i into %ix%i', (w, h, dw, dh) => {
    const out = enlarge(paint(w, h, () => [90, 90, 90, 255]), dw, dh)
    expect(out).toMatchObject({ width: dw, height: dh })
    expect(out.data).toHaveLength(dw * dh * 4)
  })

  it('gets closer to the full-size picture than blocky pixels do', () => {
    const big = paint(64, 64, (x, y) => rings(x, y, 64))
    const small = paint(16, 16, (x, y) => {
      let s = 0
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) s += rings(x * 4 + i, y * 4 + j, 64)[0]
      const v = Math.round(s / 16)
      return [v, 255 - v, 128, 255]
    })
    const truth = channel(big, 0)
    const ours = psnr(channel(enlarge(small, 64, 64), 0), truth)
    const base = psnr(channel(blocky(small, 4), 0), truth)
    expect(ours).toBeGreaterThan(base + 2)
    expect(ours).toBeGreaterThan(24)
  })

  it('keeps a left-to-right ramp in order', () => {
    const out = enlarge(paint(16, 3, (x) => [x * 16, x * 16, x * 16, 255]), 32, 6)
    const row = channel(out, 0).slice(2 * 32, 3 * 32)
    const drops = row.slice(1).filter((v, i) => v < row[i] - 1)
    expect(drops).toEqual([])
    expect(row[0]).toBeLessThan(12)
    expect(row[31]).toBeGreaterThan(230)
  })

  it('puts no dark ring around a small bright dot', () => {
    const out = enlarge(paint(9, 9, (x, y) => (x === 4 && y === 4 ? [230, 230, 230, 255] : [100, 100, 100, 255])), 27, 27)
    const grays = channel(out, 1)
    expect(Math.min(...grays)).toBeGreaterThanOrEqual(97)
    expect(Math.max(...grays)).toBeLessThanOrEqual(233)
  })

  it('keeps a cut-out the color it was, edges included', () => {
    // a blue disc; the transparent pixels around it store magenta
    const out = enlarge(paint(12, 12, (x, y) => (Math.hypot(x - 5.5, y - 5.5) < 4 ? [20, 40, 230, 255] : [255, 0, 255, 0])), 36, 36)
    const alpha = channel(out, 3)
    const red = channel(out, 0)
    const visible = alpha.map((v, i) => (v > 0 ? red[i] : 0))
    expect(Math.max(...visible)).toBeLessThanOrEqual(24)
    expect(alpha.some((v) => v > 0 && v < 255)).toBe(true)
    expect(alpha[0]).toBe(0)
  })

  it('leaves an empty picture empty', () => {
    const out = enlarge(paint(5, 4, () => [255, 255, 255, 0]), 15, 12)
    expect(out.data.every((v) => v === 0)).toBe(true)
  })

  it('reports progress that only goes up and ends at 1', () => {
    const seen: number[] = []
    enlarge(paint(6, 6, (x) => [x * 40, 0, 0, 255]), 12, 12, { rounds: 3, progress: (p) => seen.push(p) })
    expect(seen.length).toBeGreaterThan(2)
    expect(seen.every((p, i) => i === 0 || p > seen[i - 1])).toBe(true)
    expect(seen.at(-1)).toBe(1)
  })
})
