import { useEffect, useRef } from 'react'
import type { Page } from '@/doc/schema'
import type { View } from './engine'

const SIZE = 20

function niceStep(zoom: number) {
  const target = 80 / zoom
  const pow = 10 ** Math.floor(Math.log10(target))
  for (const m of [1, 2, 5, 10]) if (pow * m >= target) return pow * m
  return pow * 10
}

function draw(c: HTMLCanvasElement, len: number, horizontal: boolean, view: View, page: Page) {
  const dpr = devicePixelRatio
  c.width = (horizontal ? len : SIZE) * dpr
  c.height = (horizontal ? SIZE : len) * dpr
  const ctx = c.getContext('2d')!
  ctx.scale(dpr, dpr)
  const css = getComputedStyle(document.documentElement)
  ctx.fillStyle = css.getPropertyValue('--surface') || '#fff'
  ctx.fillRect(0, 0, horizontal ? len : SIZE, horizontal ? SIZE : len)
  const offset = horizontal ? view.panX : view.panY
  const pageLen = (horizontal ? page.width : page.height) * view.zoom
  ctx.fillStyle = 'rgba(97,43,211,0.08)'
  if (horizontal) ctx.fillRect(offset, 0, pageLen, SIZE)
  else ctx.fillRect(0, offset, SIZE, pageLen)
  const step = niceStep(view.zoom)
  const start = Math.floor(-offset / view.zoom / step) * step
  ctx.strokeStyle = css.getPropertyValue('--faint') || '#999'
  ctx.fillStyle = css.getPropertyValue('--muted') || '#666'
  ctx.font = '9px Inter, sans-serif'
  ctx.lineWidth = 1
  for (let v = start; v * view.zoom + offset < len; v += step / 5) {
    const p = Math.round(v * view.zoom + offset) + 0.5
    const major = Math.abs(v / step - Math.round(v / step)) < 1e-6
    ctx.beginPath()
    if (horizontal) {
      ctx.moveTo(p, SIZE)
      ctx.lineTo(p, major ? 4 : SIZE - 5)
    } else {
      ctx.moveTo(SIZE, p)
      ctx.lineTo(major ? 4 : SIZE - 5, p)
    }
    ctx.stroke()
    if (major) {
      if (horizontal) ctx.fillText(String(Math.round(v)), p + 3, 9)
      else {
        ctx.save()
        ctx.translate(9, p - 3)
        ctx.rotate(-Math.PI / 2)
        ctx.fillText(String(Math.round(v)), 0, 0)
        ctx.restore()
      }
    }
  }
}

export function EdgeScales({ view, page }: { view: View; page: Page }) {
  const top = useRef<HTMLCanvasElement>(null)
  const left = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (top.current) draw(top.current, view.width, true, view, page)
    if (left.current) draw(left.current, view.height, false, view, page)
  }, [view, page])
  return (
    <>
      <canvas ref={top} className="absolute top-0 border-b border-line" style={{ left: SIZE, width: view.width, height: SIZE }} aria-hidden />
      <canvas ref={left} className="absolute left-0 border-r border-line" style={{ top: SIZE, width: SIZE, height: view.height }} aria-hidden />
      <div className="absolute left-0 top-0 bg-surface border-r border-b border-line" style={{ width: SIZE, height: SIZE }} />
    </>
  )
}
