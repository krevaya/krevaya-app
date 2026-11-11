// Small helpers for writing the built-in illustrations and stickers by hand.

export type LibraryItem = { id: string; name: string; tags: string; svg: string }

export const svg = (viewBox: string, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${body}</svg>`

const r1 = (n: number) => Math.round(n * 10) / 10

/** Points for a star or burst polygon. */
export function star(cx: number, cy: number, outer: number, inner: number, points: number, rotate = -90): string {
  const out: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer
    const a = ((rotate + (i * 180) / points) * Math.PI) / 180
    out.push(`${r1(cx + r * Math.cos(a))},${r1(cy + r * Math.sin(a))}`)
  }
  return out.join(' ')
}

/** Heart path centered on cx, cy; s is about half its width. */
export function heart(cx: number, cy: number, s: number): string {
  const p = (x: number, y: number) => `${r1(cx + x * s)} ${r1(cy + y * s)}`
  return `M${p(0, 0.85)} C${p(-0.95, 0.25)} ${p(-1, -0.45)} ${p(-0.5, -0.7)} C${p(-0.2, -0.85)} ${p(0, -0.65)} ${p(0, -0.45)} `
    + `C${p(0, -0.65)} ${p(0.2, -0.85)} ${p(0.5, -0.7)} C${p(1, -0.45)} ${p(0.95, 0.25)} ${p(0, 0.85)} Z`
}

/** Four-point sparkle. */
export function sparkle(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z`
}

/** Open arrow head at (x, y), pointing away from (fx, fy). */
export function arrowHead(x: number, y: number, fx: number, fy: number, len = 24, spread = 35): string {
  const d = Math.hypot(x - fx, y - fy) || 1
  const bx = (fx - x) / d
  const by = (fy - y) / d
  const a = (spread * Math.PI) / 180
  const arm = (s: number) => `${r1(x + len * (bx * Math.cos(s * a) - by * Math.sin(s * a)))} ${r1(y + len * (bx * Math.sin(s * a) + by * Math.cos(s * a)))}`
  return `M${arm(1)} L${x} ${y} L${arm(-1)}`
}

/** Bold label text. SVGs drawn as images can't load web fonts, so this sticks to fonts most systems have. */
export function label(x: number, y: number, size: number, fill: string, text: string, extra = ''): string {
  return `<text x="${x}" y="${y}" font-family="Arial Black, Arial, Helvetica, sans-serif" font-weight="900" font-size="${size}" fill="${fill}" text-anchor="middle"${extra ? ' ' + extra : ''}>${text}</text>`
}
