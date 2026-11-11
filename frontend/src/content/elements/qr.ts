import { encode } from 'uqr'
import type { SvgElement } from '@/doc/schema'

export type QrOptions = NonNullable<SvgElement['qr']>

export const QR_DEFAULTS: QrOptions = { value: 'https://', fg: '#000000', bg: '#ffffff', level: 'M' }

/** QR code as a crisp SVG: one path for the dark modules, one module of quiet zone around it. */
export function qrSvg(o: QrOptions): string {
  const qr = encode(o.value || ' ', { ecc: o.level, border: 1 })
  const n = qr.size
  let d = ''
  qr.data.forEach((row, y) => {
    let x = 0
    while (x < n) {
      if (!row[x]) {
        x++
        continue
      }
      let run = 1
      while (x + run < n && row[x + run]) run++
      d += `M${x} ${y}h${run}v1h-${run}z`
      x += run
    }
  })
  const bg = o.bg && o.bg !== 'transparent' ? `<rect width="${n}" height="${n}" fill="${o.bg}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">${bg}<path d="${d}" fill="${o.fg}"/></svg>`
}
