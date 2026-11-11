import { describe, expect, it } from 'vitest'
import { bounds, center, clamp, corners, deg, originFor, rad } from './math'

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6)
  expect(a.y).toBeCloseTo(b.y, 6)
}

describe('math', () => {
  it('clamps and converts angles', () => {
    expect(clamp(5, 0, 3)).toBe(3)
    expect(clamp(-1, 0, 3)).toBe(0)
    expect(clamp(2, 0, 3)).toBe(2)
    expect(rad(180)).toBeCloseTo(Math.PI)
    expect(deg(Math.PI / 2)).toBeCloseTo(90)
  })

  it('gives the corners of an unrotated box', () => {
    expect(corners({ x: 10, y: 20, width: 30, height: 40 })).toEqual([
      { x: 10, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 60 }, { x: 10, y: 60 },
    ])
  })

  it('rotates about the top-left corner', () => {
    const c = corners({ x: 0, y: 0, width: 100, height: 50, rotation: 90 })
    close(c[0], { x: 0, y: 0 })
    close(c[1], { x: 0, y: 100 })
    close(c[2], { x: -50, y: 100 })
    close(c[3], { x: -50, y: 0 })
  })

  it('bounds several boxes, rotated ones included', () => {
    expect(bounds([{ x: 0, y: 0, width: 10, height: 10 }, { x: 20, y: 5, width: 10, height: 20 }])).toEqual({ x: 0, y: 0, width: 30, height: 25 })
    const b = bounds([{ x: 0, y: 0, width: 100, height: 50, rotation: 90 }])
    expect(b.x).toBeCloseTo(-50)
    expect(b.y).toBeCloseTo(0)
    expect(b.width).toBeCloseTo(50)
    expect(b.height).toBeCloseTo(100)
    expect(bounds([])).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('finds the center and back again at any angle', () => {
    close(center({ x: 0, y: 0, width: 100, height: 50 }), { x: 50, y: 25 })
    close(center({ x: 0, y: 0, width: 100, height: 50, rotation: 180 }), { x: -50, y: -25 })
    for (const r of [0, 30, 90, 135, 270, -45]) {
      const box = { x: 12, y: -7, width: 80, height: 33, rotation: r }
      const c = center(box)
      close(originFor(c.x, c.y, box.width, box.height, r), box)
    }
  })
})
