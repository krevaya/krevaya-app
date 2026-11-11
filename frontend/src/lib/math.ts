export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const rad = (deg: number) => (deg * Math.PI) / 180
export const deg = (r: number) => (r * 180) / Math.PI

export type Box = { x: number; y: number; width: number; height: number; rotation?: number }

/** Corners of a box rotated about its top-left corner (Konva's convention). */
export function corners(b: Box): Array<{ x: number; y: number }> {
  const r = rad(b.rotation ?? 0)
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  const pts = [
    [0, 0],
    [b.width, 0],
    [b.width, b.height],
    [0, b.height],
  ]
  return pts.map(([px, py]) => ({ x: b.x + px * cos - py * sin, y: b.y + px * sin + py * cos }))
}

export function bounds(boxes: Box[]): { x: number; y: number; width: number; height: number } {
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const b of boxes) {
    for (const p of corners(b)) {
      x1 = Math.min(x1, p.x)
      y1 = Math.min(y1, p.y)
      x2 = Math.max(x2, p.x)
      y2 = Math.max(y2, p.y)
    }
  }
  if (!isFinite(x1)) return { x: 0, y: 0, width: 0, height: 0 }
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 }
}

/** Center of a box rotated about its top-left corner. */
export function center(b: Box) {
  const r = rad(b.rotation ?? 0)
  return {
    x: b.x + (b.width / 2) * Math.cos(r) - (b.height / 2) * Math.sin(r),
    y: b.y + (b.width / 2) * Math.sin(r) + (b.height / 2) * Math.cos(r),
  }
}

/** Top-left corner that puts a box of this size and rotation at the given center. */
export function originFor(cx: number, cy: number, w: number, h: number, rotation: number) {
  const r = rad(rotation)
  return {
    x: cx - (w / 2) * Math.cos(r) + (h / 2) * Math.sin(r),
    y: cy - (w / 2) * Math.sin(r) - (h / 2) * Math.cos(r),
  }
}
