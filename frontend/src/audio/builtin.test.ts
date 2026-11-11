import { describe, expect, it } from 'vitest'
import { BED_ITEMS, BED_USES, CUE_ITEMS, CUE_SHELF_TITLES, synthBuiltin } from './builtin'
import { BEDS } from './beds'
import { CUES } from './cues'

describe('built-in sounds', () => {
  it('ships exactly five sounds: two music loops and three cues', () => {
    expect(BED_ITEMS).toHaveLength(2)
    expect(CUE_ITEMS).toHaveLength(3)
    expect([...BED_ITEMS, ...CUE_ITEMS]).toHaveLength(5)
  })

  it('has a unique ref and title for every bed and cue', () => {
    const refs = [...BED_ITEMS, ...CUE_ITEMS].map((s) => s.ref)
    expect(new Set(refs).size).toBe(refs.length)
    const titles = [...BED_ITEMS, ...CUE_ITEMS].map((s) => s.title.toLowerCase())
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('files every cue on a shelf and every bed under a use', () => {
    for (const c of CUES) expect(CUE_SHELF_TITLES).toContain(c.shelf)
    for (const b of BEDS) {
      expect(BED_USES).toContain(b.use)
      expect([1, 2, 3]).toContain(b.energy)
    }
  })

  it('gives every cue and bed a length', () => {
    for (const s of [...BED_ITEMS, ...CUE_ITEMS]) expect(s.lengthMs).toBeGreaterThan(0)
  })

  it.each([
    'bed:unknown',
    'cue:unknown',
    'cue:slow-sketch',
    'bed:paper-lift',
    'loop:slow-sketch',
    'slow-sketch',
    'Bed:slow-sketch',
    'bed:slow-sketch:extra',
    'cue:last-mark:extra',
  ])('rejects an unsupported sound ref: %s', async (ref) => {
    await expect(synthBuiltin(ref)).rejects.toThrow(`unknown built-in sound ${ref}`)
  })
})
