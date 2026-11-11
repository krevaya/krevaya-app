import type { Page } from '@/doc/schema'
import { FORMATS, PRINT_DPI } from '@/doc/formats'

/**
 * Pixels per inch a page was authored at. Print formats use PRINT_DPI unless the
 * format pins a size in inches, which wins. Everything else is a screen design,
 * treated as 96 dpi like CSS.
 */
export function pageDpi(page: Pick<Page, 'width' | 'height'>): number {
  const f = FORMATS.find((x) => x.group === 'Print' && x.width === page.width && x.height === page.height)
  if (!f) return 96
  if (f.inches) return page.width / f.inches[0]
  return PRINT_DPI
}

/** Physical page size in inches. */
export function pageInches(page: Pick<Page, 'width' | 'height'>) {
  const dpi = pageDpi(page)
  return { width: page.width / dpi, height: page.height / dpi }
}

/** Parse "1-3, 5" into zero-based page indexes, in the order given, without repeats. */
export function parsePageList(input: string, count: number): number[] {
  const out: number[] = []
  for (const part of input.replace(/\s*[-–]\s*/g, '-').split(/[,;\s]+/)) {
    if (!part) continue
    const m = part.match(/^(\d+)(?:-(\d+))?$/)
    if (!m) continue
    let a = parseInt(m[1], 10)
    let b = m[2] ? parseInt(m[2], 10) : a
    if (a > b) [a, b] = [b, a]
    for (let i = a; i <= b; i++) if (i >= 1 && i <= count && !out.includes(i - 1)) out.push(i - 1)
  }
  return out
}

export function abortError() {
  return new DOMException('Export canceled', 'AbortError')
}

/** Let the browser paint (progress bars) between heavy steps. */
export const nextFrame = () => new Promise<void>((r) => setTimeout(r, 0))
