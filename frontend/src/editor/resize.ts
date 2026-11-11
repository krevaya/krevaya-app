import type { DesignElement, Page } from '@/doc/schema'
import { bounds } from '@/lib/math'
import { useEditor } from '@/stores/editor'

/** reflow moves things to suit the new shape; uniform scales the whole page evenly and centers it */
export type ReshapeMode = 'uniform' | 'reflow'

/** Scale an element about its top-left corner and move it to (x, y). */
function scaled(el: DesignElement, s: number, x: number, y: number): DesignElement {
  const out = { ...el, x, y, width: el.width * s, height: el.height * s } as DesignElement
  if (out.type === 'text') out.fontSize = Math.round(out.fontSize * s * 10) / 10
  if (out.type === 'line') out.strokeWidth = Math.max(1, out.strokeWidth * s)
  if ((out.type === 'shape' || out.type === 'image') && out.strokeWidth) out.strokeWidth = out.strokeWidth * s
  if (out.type === 'shape' && out.radius) out.radius *= s
  if (out.shadow) out.shadow = { ...out.shadow, blur: out.shadow.blur * s, x: out.shadow.x * s, y: out.shadow.y * s }
  return out
}

/** Fit a page's content into a new size: scale to fit, then center. */
export function resizedElements(page: Page, w: number, h: number): DesignElement[] {
  const s = Math.min(w / page.width, h / page.height)
  const ox = (w - page.width * s) / 2
  const oy = (h - page.height * s) / 2
  return page.elements.map((el) => scaled(el, s, el.x * s + ox, el.y * s + oy))
}

/**
 * Lay a page out again for a new shape. Everything is scaled by the tighter side
 * so nothing outgrows the page, and each element (or group) keeps its center at
 * the same relative spot, so the spare room goes between things instead of round
 * the edges. Anything that covered the page, like a background photo, still does.
 */
export function reflowedElements(page: Page, w: number, h: number): DesignElement[] {
  const sx = w / page.width
  const sy = h / page.height
  const s = Math.min(sx, sy)
  const out = new Map<string, DesignElement>()
  for (const els of clusters(page)) {
    const b = bounds(els)
    const covers = els.length === 1 && !els[0].rotation && b.width >= page.width * 0.95 && b.height >= page.height * 0.95
    if (covers) {
      const el = els[0]
      if (el.type === 'image' || el.type === 'svg') {
        // keep the picture's proportions; sized to cover, the overflow is off the page
        const c = Math.max(sx, sy)
        out.set(el.id, scaled(el, c, (el.x - b.x) * c + (w - b.width * c) / 2, (el.y - b.y) * c + (h - b.height * c) / 2))
      } else {
        out.set(el.id, { ...el, x: el.x * sx, y: el.y * sy, width: el.width * sx, height: el.height * sy } as DesignElement)
      }
      continue
    }
    const cx = ((b.x + b.width / 2) / page.width) * w
    const cy = ((b.y + b.height / 2) / page.height) * h
    // things that sat inside the page stay inside; things bleeding off the edge keep bleeding
    const inside = b.x >= 0 && b.y >= 0 && b.x + b.width <= page.width && b.y + b.height <= page.height
    const clamp = (v: number, max: number) => (inside ? Math.min(Math.max(v, 0), Math.max(0, max)) : v)
    const nx = clamp(cx - (b.width * s) / 2, w - b.width * s)
    const ny = clamp(cy - (b.height * s) / 2, h - b.height * s)
    for (const el of els) out.set(el.id, scaled(el, s, nx + (el.x - b.x) * s, ny + (el.y - b.y) * s))
  }
  return page.elements.map((el) => out.get(el.id)!)
}

/**
 * Groups, plus small things sitting right next to each other (an icon and its
 * label, a title and its subtitle), move as one so they don't drift apart.
 */
function clusters(page: Page): DesignElement[][] {
  const units: DesignElement[][] = []
  const byGroup = new Map<string, DesignElement[]>()
  for (const el of page.elements) {
    if (!el.groupId) units.push([el])
    else if (byGroup.has(el.groupId)) byGroup.get(el.groupId)!.push(el)
    else {
      const g = [el]
      byGroup.set(el.groupId, g)
      units.push(g)
    }
  }
  const area = page.width * page.height
  const gap = Math.min(page.width, page.height) * 0.025
  const boxes = units.map((u) => bounds(u))
  const small = boxes.map((b) => b.width * b.height < area * 0.2)
  const parent = units.map((_, i) => i)
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])))
  const cluster = boxes.map((b) => ({ ...b, rotation: 0 }))
  for (let i = 0; i < units.length; i++) {
    if (!small[i]) continue
    for (let j = i + 1; j < units.length; j++) {
      if (!small[j]) continue
      const a = boxes[i]
      const b = boxes[j]
      if (!(a.x - gap < b.x + b.width && b.x - gap < a.x + a.width && a.y - gap < b.y + b.height && b.y - gap < a.y + a.height)) continue
      const ri = root(i)
      const rj = root(j)
      if (ri === rj) continue
      // stop a chain of neighbors from swallowing half the page
      const joined = bounds([cluster[ri], cluster[rj]])
      if (joined.width * joined.height > area * 0.12) continue
      parent[rj] = ri
      cluster[ri] = { ...joined, rotation: 0 }
    }
  }
  const merged = new Map<number, DesignElement[]>()
  units.forEach((u, i) => merged.set(root(i), [...(merged.get(root(i)) ?? []), ...u]))
  return [...merged.values()]
}

/** Resize pages in place. `all` resizes every page, otherwise just the current one. */
export function resizePages(w: number, h: number, all: boolean, mode: ReshapeMode = 'uniform') {
  const { doc, pageId } = useEditor.getState()
  if (!doc) return
  const pages = doc.getSnapshot().pages.filter((p) => all || p.id === pageId)
  doc.breakUndo()
  doc.transact(() => {
    for (const page of pages) {
      const els = mode === 'reflow' ? reflowedElements(page, w, h) : resizedElements(page, w, h)
      doc.updatePage(page.id, { width: w, height: h })
      doc.updateMany(els.map((el) => [el.id, el]))
    }
  })
  useEditor.setState({ autoFit: true })
}
