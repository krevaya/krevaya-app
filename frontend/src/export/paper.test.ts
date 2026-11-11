import { describe, expect, it } from 'vitest'
import { PRINT_DPI } from '@/doc/formats'
import { pageDpi, pageInches, parsePageList } from './paper'

describe('parsePageList', () => {
  it('reads single pages and ranges, zero-based, in the order given', () => {
    expect(parsePageList('1', 5)).toEqual([0])
    expect(parsePageList('1-3', 5)).toEqual([0, 1, 2])
    expect(parsePageList('5, 1-2', 5)).toEqual([4, 0, 1])
    expect(parsePageList('2 4', 5)).toEqual([1, 3])
    expect(parsePageList('1;3', 5)).toEqual([0, 2])
  })

  it('accepts loose spacing, en dashes and backward ranges', () => {
    expect(parsePageList(' 2 - 4 ', 5)).toEqual([1, 2, 3])
    expect(parsePageList('2–3', 5)).toEqual([1, 2])
    expect(parsePageList('4-2', 5)).toEqual([1, 2, 3])
  })

  it('drops repeats, out of range pages and junk', () => {
    expect(parsePageList('1, 1, 1-2', 5)).toEqual([0, 1])
    expect(parsePageList('0, 6, 3', 5)).toEqual([2])
    expect(parsePageList('4-9', 5)).toEqual([3, 4])
    expect(parsePageList('abc, 2x, , 2', 5)).toEqual([1])
    expect(parsePageList('', 5)).toEqual([])
    expect(parsePageList('1', 0)).toEqual([])
  })
})

describe('page size', () => {
  it('treats screen designs as 96 dpi', () => {
    expect(pageDpi({ width: 1080, height: 1350 })).toBe(96)
    expect(pageInches({ width: 1920, height: 1080 })).toEqual({ width: 20, height: 11.25 })
  })

  it('uses the print resolution for print formats', () => {
    expect(pageDpi({ width: 2480, height: 3508 })).toBe(PRINT_DPI)
    const a4 = pageInches({ width: 2480, height: 3508 })
    expect(a4.width * 25.4).toBeCloseTo(210, 0)
    expect(a4.height * 25.4).toBeCloseTo(297, 0)
  })

  it('uses the inch size a format pins', () => {
    expect(pageInches({ width: 1800, height: 2400 })).toEqual({ width: 18, height: 24 })
    expect(pageInches({ width: 1500, height: 2100 })).toEqual({ width: 5, height: 7 })
  })
})
