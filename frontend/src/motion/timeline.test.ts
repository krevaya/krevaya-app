import { describe, expect, it } from 'vitest'
import type { DesignElement, Page } from '@/doc/schema'
import type { MotionState } from '@/render/konva'
import { ease } from './easing'
import { sample, type Track } from './tracks'
import {
  ENTRANCES, EXITS, LOOPS, PAGE_CHANGES, animDuration, bodyOf, combineMotion, designDuration, entranceMove, exitMove, loopAt,
  motionAt, pageChange, pageRunTime, pageSettleTime, pageStarts, poseAt, restingSheet, sceneAt, timelineAt, transitionDuration,
  type Scene, type Sheet,
} from './timeline'

const el = (anim: DesignElement['anim']): DesignElement => ({
  id: 'e', type: 'shape', shape: 'rect', fill: { type: 'solid', color: '#000' },
  x: 200, y: 300, width: 400, height: 200, rotation: 0, opacity: 1, anim,
})
const page = (extra: Partial<Page> = {}, elements: DesignElement[] = []): Page => ({
  id: 'p', width: 1080, height: 1080, background: { type: 'solid', color: '#fff' }, elements, ...extra,
})

/** Whether a motion state leaves the element as designed. */
function asDesigned(m: MotionState | null, eps = 1e-3) {
  if (!m) return true
  const rot = (((m.rotation ?? 0) % 360) + 360) % 360
  const clip = m.clip ?? [0, 0, 1, 1]
  return (
    Math.abs((m.opacity ?? 1) - 1) < eps &&
    Math.abs(m.dx ?? 0) < eps && Math.abs(m.dy ?? 0) < eps &&
    Math.abs((m.scaleX ?? 1) - 1) < eps && Math.abs((m.scaleY ?? 1) - 1) < eps &&
    Math.min(rot, 360 - rot) < eps && (m.blur ?? 0) < eps &&
    clip[0] < eps && clip[1] < eps && clip[2] > 1 - eps && clip[3] > 1 - eps
  )
}

/** Finite numbers, opacity within 0..1. */
function sane(m: MotionState | null) {
  if (!m) return
  for (const [k, v] of Object.entries(m)) {
    if (k === 'clip') (v as number[]).forEach((n) => expect(Number.isFinite(n)).toBe(true))
    else expect(Number.isFinite(v as number), `${k} = ${v}`).toBe(true)
  }
  if (m.opacity !== undefined) {
    expect(m.opacity).toBeGreaterThanOrEqual(0)
    expect(m.opacity).toBeLessThanOrEqual(1)
  }
}

describe('tracks', () => {
  it('holds the end values outside the stops and eases between them', () => {
    const t: Track<null> = [[0.2, 10], [0.6, 20, ease.inQuad], [1, 0]]
    expect(sample(t, 0, null)).toBe(10)
    expect(sample(t, 0.4, null)).toBeCloseTo(12.5)
    expect(sample(t, 0.8, null)).toBeCloseTo(10)
    expect(sample(t, 2, null)).toBe(0)
  })

  it('works values out from the subject and runs function tracks as they are', () => {
    expect(sample<{ n: number }>([[0, (c) => c.n], [1, 0]], 0.5, { n: 8 })).toBe(4)
    expect(sample<null>((p) => p * 3, 0.5, null)).toBe(1.5)
  })
})

describe('library', () => {
  it('has unique ids and labels in each list', () => {
    for (const list of [ENTRANCES, EXITS, LOOPS, PAGE_CHANGES]) {
      expect(new Set(list.map((d) => d.id)).size).toBe(list.length)
      expect(new Set(list.map((d) => d.label)).size).toBe(list.length)
    }
    expect([ENTRANCES.length, EXITS.length, LOOPS.length, PAGE_CHANGES.length]).toEqual([34, 34, 15, 21])
  })

  it('has an exit for every entrance, each running in reverse with its own curve', () => {
    expect(EXITS.map((d) => d.id)).toEqual(ENTRANCES.map((d) => d.id))
    for (const d of EXITS) {
      expect(d.reverse).toBe(true)
      expect(d.curve).toBeTypeOf('function')
    }
  })

  it('looks moves up by id and leaves unknown names alone', () => {
    expect(entranceMove('ribbon')?.id).toBe('ribbon')
    expect(exitMove('center-wipe')?.id).toBe('center-wipe')
    expect(pageChange('pinhole')?.id).toBe('pinhole')
    for (const name of ['nope', '', undefined]) {
      expect(entranceMove(name)).toBeUndefined()
      expect(exitMove(name)).toBeUndefined()
      expect(pageChange(name)).toBeUndefined()
    }
    // a move that doesn't exist leaves the element as designed
    const e = el({ enter: { name: 'nope' }, exit: { name: 'nope' }, emphasis: { name: 'nope' } })
    for (const t of [0, 1000, 3999]) expect(motionAt(e, page({ duration: 4000 }), t)).toBeNull()
  })
})

describe('distances', () => {
  it('come from the element, not the page', () => {
    const e = el({ enter: { name: 'rise' } })
    const small = motionAt(e, page(), 0)!.dy!
    expect(motionAt(e, page({ width: 1920, height: 1920 }), 0)!.dy).toBeCloseTo(small)
    expect(motionAt({ ...e, width: 800, height: 400 }, page(), 0)!.dy).toBeCloseTo(small * 2)
  })

  it('turn page-axis travel into the element\'s own frame', () => {
    const e = { ...el({ enter: { name: 'rise' } }), rotation: 90 }
    const m = motionAt(e, page(), 0)!
    // rising on the page is sideways for an element turned a quarter
    expect(Math.abs(m.dy ?? 0)).toBeLessThan(1e-6)
    expect(Math.abs(m.dx!)).toBeGreaterThan(10)
  })

  it('send slides clear of the page edge', () => {
    const e = el({ enter: { name: 'slide-left' } })
    expect(motionAt(e, page(), 0)!.dx).toBeCloseTo(1080 - 200)
  })
})

describe('enter animations', () => {
  const p = page()
  for (const def of ENTRANCES) {
    it(`${def.id} starts away from the design and lands on it`, () => {
      const e = el({ enter: { name: def.id, delay: 200 } })
      // before its delay it waits at the starting frame
      const before = motionAt(e, p, 0)
      sane(before)
      expect(asDesigned(before), 'should not be in place before it starts').toBe(false)
      expect(motionAt(e, p, 200)).toEqual(before)
      for (let i = 1; i < 10; i++) sane(motionAt(e, p, 200 + (def.ms * i) / 10))
      // its last frame is the design, and from the end on nothing is changed
      expect(asDesigned(poseAt(def, 1, bodyOf(e, p)))).toBe(true)
      expect(motionAt(e, p, 200 + def.ms)).toBeNull()
      expect(motionAt(e, p, 4000)).toBeNull()
    })
  }
})

describe('exit animations', () => {
  const p = page({ duration: 4000 })
  for (const def of EXITS) {
    it(`${def.id} leaves by the end of the page`, () => {
      const e = el({ exit: { name: def.id } })
      const start = 4000 - def.ms
      expect(motionAt(e, p, start - 1)).toBeNull()
      expect(motionAt(e, p, start + def.ms / 2)).not.toBeNull()
      const end = motionAt(e, p, 4000)
      sane(end)
      expect(asDesigned(end)).toBe(false)
      // with no end (clicking through by hand) it never leaves
      expect(motionAt(e, p, 3999, Infinity)).toBeNull()
    })
  }

  it('eases away gently instead of replaying the entrance backward', () => {
    const e = el({ exit: { name: 'rise' } })
    const body = bodyOf(e, p)
    const exitQuarter = motionAt(e, p, 4000 - entranceMove('rise')!.ms * 0.75)!.dy!
    const mirrored = poseAt(entranceMove('rise')!, 0.75, body).dy!
    expect(exitQuarter).toBeGreaterThan(0)
    expect(exitQuarter).toBeLessThan(mirrored)
  })

  it('uses the delay as a gap before the page ends', () => {
    const e = el({ exit: { name: 'fade', duration: 500, delay: 1000 } })
    expect(motionAt(e, page({ duration: 4000 }), 2499)).toBeNull()
    expect(motionAt(e, page({ duration: 4000 }), 3000)?.opacity).toBeCloseTo(0)
  })
})

describe('emphasis animations', () => {
  const p = page({ duration: 6000 })
  for (const def of LOOPS) {
    it(`${def.id} loops without a jump and fades in and out`, () => {
      const body = bodyOf(el(undefined), p)
      // the end of one loop meets the start of the next
      const a = loopAt(def, 0, 1, body)
      const b = loopAt(def, 0.99999, 1, body)
      for (const k of ['opacity', 'dx', 'dy', 'scaleX', 'scaleY'] as const) expect(a[k] ?? (k.startsWith('scale') || k === 'opacity' ? 1 : 0)).toBeCloseTo(b[k] ?? (k.startsWith('scale') || k === 'opacity' ? 1 : 0), 2)
      // at zero strength it's the design
      for (const t of [0, 0.25, 0.5, 0.75]) expect(asDesigned(loopAt(def, t, 0, body))).toBe(true)
      const e = el({ enter: { name: 'fade' }, emphasis: { name: def.id } })
      const enterEnd = animDuration('enter', { name: 'fade' })
      // waits for the enter animation to finish
      expect(motionAt(e, p, enterEnd)).toBeNull()
      expect(asDesigned(motionAt(e, p, enterEnd + 0.5), 0.01)).toBe(true)
      for (let t = enterEnd; t < 6000; t += 37) sane(motionAt(e, p, t))
    })
  }
})

describe('combineMotion', () => {
  it('multiplies opacity and scale, adds offsets, and intersects clips', () => {
    expect(combineMotion(null, { opacity: 0.5 })).toEqual({ opacity: 0.5 })
    expect(combineMotion({ opacity: 0.5, dx: 3, scaleX: 2, clip: [0, 0, 0.8, 1] }, { opacity: 0.5, dx: 4, scaleX: 0.5, clip: [0.2, 0, 1, 1] }))
      .toEqual({ opacity: 0.25, dx: 7, scaleX: 1, clip: [0.2, 0, 0.8, 1] })
  })
})

describe('page timing', () => {
  const pages = [page({ id: 'a' }), page({ id: 'b', duration: 2000 }), page({ id: 'c', duration: 3000, transition: { name: 'fade', duration: 600 } })]

  it('adds up page durations', () => {
    expect(pageRunTime(pages[0])).toBe(5000)
    expect(pageStarts(pages)).toEqual([0, 5000, 7000])
    expect(designDuration({ pages, settings: {} })).toBe(10000)
  })

  it('knows which page shows at any time', () => {
    expect(timelineAt(pages, 0)).toMatchObject({ index: 0, local: 0, transition: null })
    expect(timelineAt(pages, 5000)).toMatchObject({ index: 1, local: 0, transition: null })
    expect(timelineAt(pages, 7300)).toMatchObject({ index: 2, local: 300, transition: { prevIndex: 1, progress: 0.5 } })
    expect(timelineAt(pages, 7600).transition).toBeNull()
    // past the end it stays on the last page
    expect(timelineAt(pages, 99999)).toMatchObject({ index: 2 })
  })

  it('waits for the slowest enter animation to settle', () => {
    const p = page({}, [el({ enter: { name: 'fade', delay: 300 } }), { ...el({ enter: { name: 'rise', duration: 2000 } }), id: 'f' }])
    expect(pageSettleTime(p)).toBe(2000)
  })

  it('caps a transition at the page length and ignores unknown ones', () => {
    expect(transitionDuration(page({ duration: 500, transition: { name: 'fade', duration: 900 } }))).toBe(500)
    expect(transitionDuration(page({ transition: { name: 'nope', duration: 900 } }))).toBe(0)
    expect(transitionDuration(page())).toBe(0)
  })
})

describe('page changes', () => {
  /** Shoelace area of a window outline, in percent squared. */
  const area = (pts: ReadonlyArray<readonly [number, number]>) =>
    Math.abs(pts.reduce((sum, [x, y], i) => {
      const [nx, ny] = pts[(i + 1) % pts.length]
      return sum + x * ny - nx * y
    }, 0)) / 2
  const sheetOf = (s: Scene, side: Sheet['side']) => s.sheets.find((x) => x.side === side)
  /** Drawn fully, in place. */
  const plain = (l: Sheet | undefined) =>
    !!l && l.alpha > 0.999 && Math.abs(l.shiftX) < 0.1 && Math.abs(l.shiftY) < 0.1 &&
    Math.abs(l.zoomX - 1) < 1e-3 && Math.abs(l.zoomY - 1) < 1e-3 &&
    (!l.window || (l.window.kind === 'band' ? [l.window.l, l.window.t, l.window.r, l.window.b].join() === '0,0,100,100' : l.window.kind === 'spot' && l.window.reach >= 100))
  const hidden = (l: Sheet | undefined) =>
    !l || l.alpha < 1e-3 || Math.abs(l.shiftX) >= 100 || Math.abs(l.shiftY) >= 100 || Math.abs(l.zoomX) < 0.01 ||
    (!!l.window && (l.window.kind === 'band' ? l.window.r - l.window.l < 0.1 : l.window.kind === 'shape' ? area(l.window.pts) < 0.1 : l.window.reach < 0.1))

  for (const def of PAGE_CHANGES) {
    it(`${def.id} goes from the old page to the new one`, () => {
      const prev = page({ id: 'a' })
      const next = page({ id: 'b', transition: { name: def.id, duration: def.ms } })
      const start = sceneAt(prev, next, 0)
      const end = sceneAt(prev, next, 1)
      // at the start only the old page shows, at the end only the new one
      const top = start.sheets[start.sheets.length - 1]
      expect(hidden(sheetOf(start, 'incoming')) || top.side === 'outgoing', 'new page hidden at the start').toBe(true)
      expect(plain(sheetOf(end, 'incoming')), 'new page in place at the end').toBe(true)
      expect(end.sheets[end.sheets.length - 1].side).toBe('incoming')
      expect(start.matte).toMatch(/^#[0-9a-f]{6}$/)
      for (let i = 0; i <= 10; i++) {
        for (const l of sceneAt(prev, next, i / 10).sheets) {
          for (const v of Object.values(l)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true)
          const w = l.window
          const nums = !w ? [] : w.kind === 'band' ? [w.l, w.t, w.r, w.b] : w.kind === 'spot' ? [w.x, w.y, w.reach] : w.pts.flat()
          nums.forEach((n) => expect(Number.isFinite(n)).toBe(true))
        }
      }
    })
  }

  it('shows just the new page when there is no change', () => {
    expect(sceneAt(null, page(), 0.5)).toEqual({ matte: '#000000', sheets: [restingSheet()] })
    expect(sceneAt(page(), page({ transition: { name: 'nope', duration: 1 } }), 0.5).sheets.map((s) => s.side)).toEqual(['incoming'])
  })

  it('groups the list by family, with blends last', () => {
    const fams = PAGE_CHANGES.map((d) => d.family)
    expect(fams.slice(-3)).toEqual(['Blend', 'Blend', 'Blend'])
    // each family sits together
    expect(new Set(fams).size).toBe(fams.filter((f, i) => f !== fams[i - 1]).length)
  })
})
