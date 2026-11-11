import { describe, expect, it } from 'vitest'
import { box, ring, turned, type Mark } from './marks'
import { RAIL_ICONS } from './rail-paths'
import { UI_ICONS } from './ui-paths'

const all: [string, readonly Mark[]][] = [...Object.entries(UI_ICONS), ...Object.entries(RAIL_ICONS)]

describe('icon geometry', () => {
  it('every icon has at least one well formed path', () => {
    for (const [name, marks] of all) {
      expect(marks.length, name).toBeGreaterThan(0)
      for (const m of marks) {
        const d = typeof m === 'string' ? m : m.d
        expect(d, name).toMatch(/^[Mm][\d\s.,\-MmLlHhVvCcSsQqTtAaZz]+$/)
      }
    }
  })

  it('stays on the 24 grid', () => {
    for (const [name, marks] of all) {
      for (const m of marks) {
        const d = typeof m === 'string' ? m : m.d
        const start = d.match(/^M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)/i)
        expect(start, name).not.toBeNull()
        for (const v of start!.slice(1).map(Number)) expect(v >= 0 && v <= 24, `${name} ${d.slice(0, 20)}`).toBe(true)
      }
    }
  })

  it('builds circles and rounded boxes', () => {
    expect(ring(12, 12, 2)).toBe('M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0Z')
    expect(box(2, 2, 10, 6, 1)).toBe('M3 2h8a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-8a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1Z')
  })

  it('turns marks without losing their style', () => {
    expect(turned(['M1 1h2', { d: 'M2 2h1', fill: true, turn: 90 }], 90)).toEqual([
      { d: 'M1 1h2', turn: 90 },
      { d: 'M2 2h1', fill: true, turn: 180 },
    ])
  })
})
