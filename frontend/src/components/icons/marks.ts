// a mark is one <path>. plain strings are outlines; objects can be solid,
// thinner/thicker, faded or turned about the center of the 24 grid.
export type Mark = string | { d: string; fill?: true; w?: number; o?: number; turn?: number }

const n = (v: number) => +v.toFixed(3)

/** solid circle, used for the small dots that end some strokes */
export const dot = (cx: number, cy: number, r: number): Mark => ({ d: ring(cx, cy, r), fill: true })

/** circle outline as path data */
export function ring(cx: number, cy: number, r: number) {
  return `M${n(cx - r)} ${n(cy)}a${n(r)} ${n(r)} 0 1 0 ${n(r * 2)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-r * 2)} 0Z`
}

/** rounded rectangle as path data */
export function box(x: number, y: number, w: number, h: number, r: number) {
  const a = `a${n(r)} ${n(r)} 0 0 1`
  return `M${n(x + r)} ${n(y)}h${n(w - 2 * r)}${a} ${n(r)} ${n(r)}v${n(h - 2 * r)}${a} ${n(-r)} ${n(r)}h${n(2 * r - w)}${a} ${n(-r)} ${n(-r)}v${n(2 * r - h)}${a} ${n(r)} ${n(-r)}Z`
}

/** the same glyph rotated, for mirrored pairs like upload/download */
export function turned(marks: readonly Mark[], deg: number): Mark[] {
  return marks.map((m) => (typeof m === 'string' ? { d: m, turn: deg } : { ...m, turn: (m.turn ?? 0) + deg }))
}
