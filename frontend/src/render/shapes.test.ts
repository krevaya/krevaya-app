import { describe, expect, it } from 'vitest'
import { SHAPES, shapePath } from './shapes'

// how many numbers each SVG path command takes
const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, A: 7, Z: 0 }

/** Split a path into commands, checking every command gets the right number of finite numbers. */
function parse(d: string) {
  const tokens = d.match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? []
  // nothing but commands, numbers, spaces and commas
  expect(d.replace(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?|[\s,]/g, '')).toBe('')
  const cmds: Array<{ c: string; n: number[] }> = []
  for (const t of tokens) {
    if (/[A-Za-z]/.test(t)) {
      expect(Object.keys(ARGS)).toContain(t)
      cmds.push({ c: t, n: [] })
    } else {
      expect(cmds.length).toBeGreaterThan(0)
      cmds[cmds.length - 1].n.push(Number(t))
    }
  }
  for (const { c, n } of cmds) {
    expect(n.every(Number.isFinite)).toBe(true)
    expect(n.length, `${c} ${n.join(' ')}`).toBe(ARGS[c])
  }
  return cmds
}

/** The x, y end points the path visits (control points included for curves). */
function points(cmds: Array<{ c: string; n: number[] }>) {
  const out: Array<[number, number]> = []
  let x = 0
  let y = 0
  for (const { c, n } of cmds) {
    if (c === 'H') x = n[0]
    else if (c === 'V') y = n[0]
    else if (c === 'A') [x, y] = [n[5], n[6]]
    else if (c !== 'Z') for (let i = 0; i < n.length; i += 2) [x, y] = [n[i], n[i + 1]]
    out.push([x, y])
  }
  return out
}

const SIZES: Array<[number, number]> = [[100, 100], [300, 120], [40, 260], [24, 24]]

describe('shapePath', () => {
  it('has a label for every kind, with no repeats', () => {
    const kinds = SHAPES.map((s) => s.kind)
    expect(new Set(kinds).size).toBe(kinds.length)
    expect(SHAPES.every((s) => s.label.trim().length > 0)).toBe(true)
  })

  for (const { kind } of SHAPES) {
    it(`draws a valid closed path for ${kind}`, () => {
      for (const [w, h] of SIZES) {
        const d = shapePath(kind, w, h, 12)
        expect(d).not.toMatch(/NaN|Infinity|undefined/)
        const cmds = parse(d)
        expect(cmds[0].c).toBe('M')
        expect(cmds.at(-1)!.c).toBe('Z')
        // stays in (or very nearly in) its box; curves may bulge a touch past the edge
        const slack = Math.max(w, h) * 0.05 + 0.02
        for (const [x, y] of points(cmds)) {
          expect(x).toBeGreaterThanOrEqual(-slack)
          expect(x).toBeLessThanOrEqual(w + slack)
          expect(y).toBeGreaterThanOrEqual(-slack)
          expect(y).toBeLessThanOrEqual(h + slack)
        }
      }
    })
  }

  it('rounds corners only as far as the box allows', () => {
    expect(shapePath('rect', 100, 50, 0)).toBe('M0 0 H100 V50 H0 Z')
    const huge = parse(shapePath('rect', 100, 50, 999))
    const arcs = huge.filter((c) => c.c === 'A')
    expect(arcs).toHaveLength(4)
    for (const a of arcs) expect(a.n.slice(0, 2)).toEqual([25, 25])
  })

  it('falls back to a rectangle for unknown kinds, like photo frames named "none"', () => {
    expect(shapePath('none', 80, 40)).toBe(shapePath('rect', 80, 40))
  })
})
