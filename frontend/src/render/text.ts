import Konva from 'konva'
import type { TextElement } from '@/doc/schema'

export function displayText(el: TextElement): string {
  let text = el.uppercase ? el.text.toUpperCase() : el.text
  if (el.list === 'bullet' || el.list === 'number') {
    let n = 0
    text = text
      .split('\n')
      .map((line) => {
        if (!line.trim()) return line
        n += 1
        return (el.list === 'bullet' ? '•  ' : `${n}.  `) + line
      })
      .join('\n')
  }
  return text
}

export function fontStyle(el: Pick<TextElement, 'italic' | 'fontWeight'>): string {
  return `${el.italic ? 'italic ' : ''}${el.fontWeight || 400}`
}

export function textDecoration(el: TextElement): string {
  return [el.underline ? 'underline' : '', el.strike ? 'line-through' : ''].filter(Boolean).join(' ')
}

export function baseTextAttrs(el: TextElement) {
  return {
    text: displayText(el),
    fontFamily: `"${el.fontFamily}", Inter, sans-serif`,
    fontSize: el.fontSize,
    fontStyle: fontStyle(el),
    align: el.align,
    lineHeight: el.lineHeight || 1.2,
    letterSpacing: el.letterSpacing ? (el.letterSpacing / 1000) * el.fontSize : 0,
    textDecoration: textDecoration(el),
    wrap: 'word',
  }
}

const measurer = new Konva.Text({})

/** Height the text needs at its current width. */
export function measureTextHeight(el: TextElement): number {
  if (el.curve) return curvedBox(el).height
  measurer.setAttrs({ ...baseTextAttrs(el), width: Math.max(1, el.width), height: undefined })
  return Math.ceil(measurer.height())
}

export function singleLineWidth(el: TextElement): number {
  measurer.setAttrs({ ...baseTextAttrs(el), text: displayText(el).replace(/\n/g, ' '), width: undefined, wrap: 'none' })
  return measurer.width()
}

// Curved text: the line is laid along a circular arc. curve 100 bends it into an
// almost full circle; negative values curve downward.

export function arcLayout(el: TextElement) {
  const len = Math.max(1, singleLineWidth(el))
  const amount = Math.max(-100, Math.min(100, el.curve ?? 0))
  const angle = (Math.abs(amount) / 100) * Math.PI * 1.9
  const radius = len / Math.max(angle, 0.0001)
  return { len, angle, radius, up: amount > 0 }
}

export function curvedBox(el: TextElement): { width: number; height: number } {
  const { angle, radius } = arcLayout(el)
  const fs = el.fontSize
  const chord = angle >= Math.PI ? 2 * radius : 2 * radius * Math.sin(angle / 2)
  const sag = angle >= Math.PI ? radius + radius * Math.sin(angle / 2 - Math.PI / 2) : radius * (1 - Math.cos(angle / 2))
  // past a half circle the letters at the sides stand sideways, so give them room
  const side = angle >= Math.PI * 0.8 ? 1.6 : 1.2
  return { width: Math.ceil(chord + fs * side), height: Math.ceil(sag + fs * 1.4) }
}

/**
 * SVG path for the baseline, in the element's own box. It's the whole circle,
 * starting opposite the middle of the text: the renderer centers the text on
 * it, so the text sits centered on the arc and a slightly long measurement
 * can't push the last letters off the end of the path.
 */
export function curvePath(el: TextElement, w: number, h: number): string {
  const { radius: r, up } = arcLayout(el)
  const fs = el.fontSize
  const cx = w / 2
  // Curving up, the center sits below the text and letters stand outside the
  // circle. Curving down, it sits above and letters stand inside it.
  const cy = up ? fs + r : h - fs * 0.3 - r
  const start = up ? cy + r : cy - r
  const mid = up ? cy - r : cy + r
  const sweep = up ? 1 : 0
  return `M${cx} ${start} A${r} ${r} 0 1 ${sweep} ${cx} ${mid} A${r} ${r} 0 1 ${sweep} ${cx} ${start}`
}
