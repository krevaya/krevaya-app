import { describe, expect, it } from 'vitest'
import type { DesignElement, Page } from '@/doc/schema'
import { resizedElements } from './resize'

const base = { rotation: 0, opacity: 1 }
const page: Page = {
  id: 'p', width: 1000, height: 1000, background: { type: 'solid', color: '#fff' },
  elements: [
    { ...base, id: 't', type: 'text', x: 100, y: 100, width: 800, height: 120, text: 'Hi', fontFamily: 'Inter', fontSize: 100, fontWeight: 700, align: 'left', lineHeight: 1.2, letterSpacing: 0, color: '#000' },
    { ...base, id: 's', type: 'shape', shape: 'rect', fill: { type: 'solid', color: '#000' }, x: 0, y: 0, width: 1000, height: 1000, strokeWidth: 10, radius: 40, shadow: { color: '#000', blur: 20, x: 4, y: 8, opacity: 0.3 } },
    { ...base, id: 'l', type: 'line', x: 0, y: 500, width: 1000, height: 24, stroke: '#000', strokeWidth: 1, startHead: 'none', endHead: 'none' },
  ],
}

const get = (els: DesignElement[], id: string) => els.find((e) => e.id === id)!

describe('resizedElements', () => {
  it('scales to fit and centers in a wider page', () => {
    const els = resizedElements(page, 2000, 1000)
    const s = get(els, 's')
    // fits the height, centered across
    expect(s).toMatchObject({ x: 500, y: 0, width: 1000, height: 1000 })
    const t = get(els, 't')
    expect(t).toMatchObject({ x: 600, y: 100, width: 800, fontSize: 100 })
  })

  it('shrinks text, strokes, corners and shadows with the page', () => {
    const els = resizedElements(page, 500, 1000)
    const t = get(els, 't') as Extract<DesignElement, { type: 'text' }>
    expect(t.fontSize).toBe(50)
    expect(t).toMatchObject({ x: 50, y: 300, width: 400, height: 60 })
    const s = get(els, 's') as Extract<DesignElement, { type: 'shape' }>
    expect(s).toMatchObject({ x: 0, y: 250, width: 500, height: 500, strokeWidth: 5, radius: 20 })
    expect(s.shadow).toEqual({ color: '#000', blur: 10, x: 2, y: 4, opacity: 0.3 })
    // lines never get thinner than a pixel
    expect((get(els, 'l') as Extract<DesignElement, { type: 'line' }>).strokeWidth).toBe(1)
  })

  it('leaves the source page alone', () => {
    const copy = structuredClone(page)
    resizedElements(page, 300, 700)
    expect(page).toEqual(copy)
  })

  it('keeps everything inside the new page', () => {
    for (const [w, h] of [[1080, 1920], [1920, 1080], [500, 500], [3000, 200]]) {
      for (const el of resizedElements(page, w, h)) {
        expect(el.x).toBeGreaterThanOrEqual(-0.001)
        expect(el.y).toBeGreaterThanOrEqual(-0.001)
        expect(el.x + el.width).toBeLessThanOrEqual(w + 0.001)
        expect(el.y + el.height).toBeLessThanOrEqual(h + 0.001)
      }
    }
  })
})
