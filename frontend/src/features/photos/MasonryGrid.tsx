import type { ReactNode } from 'react'

/** Two columns, each item going to the shorter one so appending never reshuffles. */
export function MasonryGrid<T>({ items, ratio, render }: { items: T[]; ratio: (t: T) => number; render: (t: T) => ReactNode }) {
  const cols: T[][] = [[], []]
  const heights = [0, 0]
  for (const it of items) {
    const i = heights[0] <= heights[1] ? 0 : 1
    cols[i].push(it)
    heights[i] += Math.min(3, Math.max(0.3, ratio(it) || 1)) + 0.05
  }
  return (
    <div className="flex gap-2 items-start">
      {cols.map((c, i) => (
        <div key={i} className="flex-1 min-w-0 flex flex-col gap-2">{c.map(render)}</div>
      ))}
    </div>
  )
}
