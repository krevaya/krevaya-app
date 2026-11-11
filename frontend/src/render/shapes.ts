import type { ShapeKind } from '@/doc/schema'

// Every shape is an SVG path inside a w x h box. The same path draws the shape on
// the canvas, clips photos in a frame and goes straight into SVG exports.

const f = (n: number) => Math.round(n * 100) / 100

function poly(points: Array<[number, number]>): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y)}`).join(' ') + ' Z'
}

function regular(w: number, h: number, sides: number, rotate = -Math.PI / 2): string {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < sides; i++) {
    const a = rotate + (i * 2 * Math.PI) / sides
    pts.push([w / 2 + (w / 2) * Math.cos(a), h / 2 + (h / 2) * Math.sin(a)])
  }
  return poly(pts)
}

function star(w: number, h: number, points: number, inner: number): string {
  const pts: Array<[number, number]> = []
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points
    const r = i % 2 === 0 ? 1 : inner
    pts.push([w / 2 + (w / 2) * r * Math.cos(a), h / 2 + (h / 2) * r * Math.sin(a)])
  }
  return poly(pts)
}

function roundedRect(w: number, h: number, r: number): string {
  r = Math.max(0, Math.min(r, w / 2, h / 2))
  if (r === 0) return `M0 0 H${f(w)} V${f(h)} H0 Z`
  return [
    `M${f(r)} 0`, `H${f(w - r)}`, `A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(r)}`, `V${f(h - r)}`,
    `A${f(r)} ${f(r)} 0 0 1 ${f(w - r)} ${f(h)}`, `H${f(r)}`, `A${f(r)} ${f(r)} 0 0 1 0 ${f(h - r)}`,
    `V${f(r)}`, `A${f(r)} ${f(r)} 0 0 1 ${f(r)} 0`, 'Z',
  ].join(' ')
}

function ellipse(w: number, h: number): string {
  const rx = w / 2
  const ry = h / 2
  return `M0 ${f(ry)} A${f(rx)} ${f(ry)} 0 1 0 ${f(w)} ${f(ry)} A${f(rx)} ${f(ry)} 0 1 0 0 ${f(ry)} Z`
}

export function shapePath(kind: ShapeKind | string, w: number, h: number, radius = 0): string {
  switch (kind) {
    case 'rect':
      return roundedRect(w, h, radius)
    case 'rounded':
      return roundedRect(w, h, radius || Math.min(w, h) * 0.14)
    case 'ellipse':
      return ellipse(w, h)
    case 'triangle':
      return poly([[w / 2, 0], [w, h], [0, h]])
    case 'right-triangle':
      return poly([[0, 0], [w, h], [0, h]])
    case 'diamond':
      return poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]])
    case 'pentagon':
      return regular(w, h, 5)
    case 'hexagon':
      return regular(w, h, 6, 0)
    case 'octagon':
      return regular(w, h, 8, Math.PI / 8)
    case 'star':
      return star(w, h, 5, 0.382)
    case 'star-6':
      return star(w, h, 6, 0.577)
    case 'burst':
      return star(w, h, 22, 0.8)
    case 'heart':
      return `M${f(w / 2)} ${f(h * 0.92)} C${f(w * 0.1)} ${f(h * 0.62)} ${f(-w * 0.02)} ${f(h * 0.28)} ${f(w * 0.22)} ${f(h * 0.1)} C${f(w * 0.36)} ${f(-h * 0.02)} ${f(w * 0.47)} ${f(h * 0.08)} ${f(w / 2)} ${f(h * 0.2)} C${f(w * 0.53)} ${f(h * 0.08)} ${f(w * 0.64)} ${f(-h * 0.02)} ${f(w * 0.78)} ${f(h * 0.1)} C${f(w * 1.02)} ${f(h * 0.28)} ${f(w * 0.9)} ${f(h * 0.62)} ${f(w / 2)} ${f(h * 0.92)} Z`
    case 'arrow-right':
      return poly([[0, h * 0.3], [w * 0.6, h * 0.3], [w * 0.6, 0], [w, h / 2], [w * 0.6, h], [w * 0.6, h * 0.7], [0, h * 0.7]])
    case 'arrow-left':
      return poly([[w, h * 0.3], [w * 0.4, h * 0.3], [w * 0.4, 0], [0, h / 2], [w * 0.4, h], [w * 0.4, h * 0.7], [w, h * 0.7]])
    case 'arrow-up':
      return poly([[w * 0.3, h], [w * 0.3, h * 0.4], [0, h * 0.4], [w / 2, 0], [w, h * 0.4], [w * 0.7, h * 0.4], [w * 0.7, h]])
    case 'arrow-down':
      return poly([[w * 0.3, 0], [w * 0.3, h * 0.6], [0, h * 0.6], [w / 2, h], [w, h * 0.6], [w * 0.7, h * 0.6], [w * 0.7, 0]])
    case 'chevron':
      return poly([[0, 0], [w * 0.7, 0], [w, h / 2], [w * 0.7, h], [0, h], [w * 0.3, h / 2]])
    case 'cross':
      return poly([[w / 3, 0], [(2 * w) / 3, 0], [(2 * w) / 3, h / 3], [w, h / 3], [w, (2 * h) / 3], [(2 * w) / 3, (2 * h) / 3], [(2 * w) / 3, h], [w / 3, h], [w / 3, (2 * h) / 3], [0, (2 * h) / 3], [0, h / 3], [w / 3, h / 3]])
    case 'parallelogram':
      return poly([[w * 0.25, 0], [w, 0], [w * 0.75, h], [0, h]])
    case 'trapezoid':
      return poly([[w * 0.2, 0], [w * 0.8, 0], [w, h], [0, h]])
    case 'tag':
      return poly([[0, 0], [w * 0.75, 0], [w, h / 2], [w * 0.75, h], [0, h]])
    case 'speech': {
      const bh = h * 0.78
      const r = Math.min(w, bh) * 0.2
      return `${roundedRect(w, bh, r).replace(/ Z$/, '')} Z M${f(w * 0.2)} ${f(bh - 1)} L${f(w * 0.16)} ${f(h)} L${f(w * 0.42)} ${f(bh - 1)} Z`
    }
    case 'cloud':
      return `M${f(w * 0.25)} ${f(h * 0.9)} C${f(w * 0.05)} ${f(h * 0.9)} ${f(-w * 0.02)} ${f(h * 0.6)} ${f(w * 0.14)} ${f(h * 0.48)} C${f(w * 0.08)} ${f(h * 0.22)} ${f(w * 0.36)} ${f(h * 0.08)} ${f(w * 0.48)} ${f(h * 0.24)} C${f(w * 0.56)} ${f(h * 0.02)} ${f(w * 0.88)} ${f(h * 0.06)} ${f(w * 0.84)} ${f(h * 0.38)} C${f(w * 1.02)} ${f(h * 0.42)} ${f(w * 1.02)} ${f(h * 0.88)} ${f(w * 0.78)} ${f(h * 0.9)} Z`
    case 'ring': {
      const t = Math.min(w, h) * 0.18
      return `${ellipse(w, h)} M${f(t)} ${f(h / 2)} A${f(w / 2 - t)} ${f(h / 2 - t)} 0 1 1 ${f(w - t)} ${f(h / 2)} A${f(w / 2 - t)} ${f(h / 2 - t)} 0 1 1 ${f(t)} ${f(h / 2)} Z`
    }
    case 'half-circle':
      return `M0 ${f(h)} A${f(w / 2)} ${f(h)} 0 0 1 ${f(w)} ${f(h)} Z`
    case 'arch': {
      // a wide, short arch flattens its top instead of spilling out of the box
      const ry = Math.min(w / 2, h)
      return `M0 ${f(h)} V${f(ry)} A${f(w / 2)} ${f(ry)} 0 0 1 ${f(w)} ${f(ry)} V${f(h)} Z`
    }
    case 'blob':
      return `M${f(w * 0.52)} ${f(h * 0.02)} C${f(w * 0.8)} ${f(h * 0.0)} ${f(w * 1.0)} ${f(h * 0.25)} ${f(w * 0.97)} ${f(h * 0.52)} C${f(w * 0.94)} ${f(h * 0.8)} ${f(w * 0.72)} ${f(h * 1.0)} ${f(w * 0.46)} ${f(h * 0.97)} C${f(w * 0.18)} ${f(h * 0.94)} ${f(w * 0.0)} ${f(h * 0.74)} ${f(w * 0.03)} ${f(h * 0.46)} C${f(w * 0.06)} ${f(h * 0.2)} ${f(w * 0.26)} ${f(h * 0.04)} ${f(w * 0.52)} ${f(h * 0.02)} Z`
    default:
      return roundedRect(w, h, radius)
  }
}

export const SHAPES: Array<{ kind: ShapeKind; label: string }> = [
  { kind: 'rect', label: 'Square' },
  { kind: 'rounded', label: 'Rounded square' },
  { kind: 'ellipse', label: 'Circle' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'right-triangle', label: 'Right triangle' },
  { kind: 'diamond', label: 'Diamond' },
  { kind: 'pentagon', label: 'Pentagon' },
  { kind: 'hexagon', label: 'Hexagon' },
  { kind: 'octagon', label: 'Octagon' },
  { kind: 'star', label: 'Star' },
  { kind: 'star-6', label: 'Six-point star' },
  { kind: 'burst', label: 'Burst' },
  { kind: 'heart', label: 'Heart' },
  { kind: 'arrow-right', label: 'Arrow right' },
  { kind: 'arrow-left', label: 'Arrow left' },
  { kind: 'arrow-up', label: 'Arrow up' },
  { kind: 'arrow-down', label: 'Arrow down' },
  { kind: 'chevron', label: 'Chevron' },
  { kind: 'cross', label: 'Cross' },
  { kind: 'speech', label: 'Speech bubble' },
  { kind: 'cloud', label: 'Cloud' },
  { kind: 'parallelogram', label: 'Parallelogram' },
  { kind: 'trapezoid', label: 'Trapezoid' },
  { kind: 'tag', label: 'Tag' },
  { kind: 'ring', label: 'Ring' },
  { kind: 'half-circle', label: 'Half circle' },
  { kind: 'arch', label: 'Arch' },
  { kind: 'blob', label: 'Blob' },
]
