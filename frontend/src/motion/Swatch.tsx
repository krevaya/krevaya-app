import { useEffect, useRef, type CSSProperties } from 'react'
import type { MotionState } from '@/render/konva'
import { clamp01 } from './easing'
import { bodyOf, entranceMove, exitMove, loopAt, loopMove, poseAt, type Body } from './moves'
import { pageChange, sceneOf, windowPath, type Sheet } from './pageChanges'

// Little animated previews for the Animate pane tiles. They sample the same
// tracks as the canvas and draw the result with CSS.

const W = 72
const H = 48
const BOX = { x: 22, y: 10, width: 28, height: 28, rotation: 0 }
// the chip is tiny, so moves get a bigger span than its real size to stay readable
const BODY: Body = { ...bodyOf({ ...BOX, type: 'text', text: 'Abcdef' }, { width: W, height: H }), span: 64 }

function motionCss(m: MotionState | null): CSSProperties {
  if (!m) return { transform: 'none', opacity: 1, filter: 'none', clipPath: 'none' }
  const [x0, y0, x1, y1] = m.clip ?? [0, 0, 1, 1]
  return {
    transform: `translate(${m.dx ?? 0}px, ${m.dy ?? 0}px) rotate(${m.rotation ?? 0}deg) scale(${m.scaleX ?? 1}, ${m.scaleY ?? 1})`,
    opacity: m.opacity ?? 1,
    filter: m.blur ? `blur(${m.blur * 0.15}px)` : 'none',
    clipPath: m.clip ? `inset(${y0 * 100}% ${(1 - x1) * 100}% ${(1 - y1) * 100}% ${x0 * 100}%)` : 'none',
  }
}

function useLoop(active: boolean, frame: (ms: number) => void) {
  const fn = useRef(frame)
  fn.current = frame
  useEffect(() => {
    if (!active) {
      fn.current(-1)
      return
    }
    let raf = 0
    const t0 = performance.now()
    const tick = () => {
      fn.current(performance.now() - t0)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active])
}

export function MotionSwatch({ phase, name, active }: { phase: 'enter' | 'exit' | 'emphasis'; name: string; active: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  useLoop(active, (ms) => {
    const el = box.current
    if (!el) return
    let m: MotionState | null = null
    if (ms >= 0) {
      if (phase === 'emphasis') {
        const lp = loopMove(name)
        if (lp) m = loopAt(lp, (ms % lp.ms) / lp.ms, Math.min(1, ms / 250), BODY)
      } else {
        const mv = phase === 'exit' ? exitMove(name) : entranceMove(name)
        // play, hold, repeat
        if (mv) m = poseAt(mv, clamp01((ms % (mv.ms + 700)) / mv.ms), BODY)
      }
    }
    Object.assign(el.style, motionCss(m))
  })
  return (
    <div className="relative overflow-hidden rounded-[8px] bg-surface" style={{ width: W, height: H }} aria-hidden>
      <div
        ref={box}
        className="absolute rounded-[7px] bg-accent text-white text-[13px] font-semibold flex items-center justify-center"
        style={{ left: BOX.x, top: BOX.y, width: BOX.width, height: BOX.height }}
      >
        Aa
      </div>
    </div>
  )
}

function sheetCss(sh: Sheet | undefined): CSSProperties {
  if (!sh) return { visibility: 'hidden' }
  return {
    visibility: 'visible',
    opacity: sh.alpha,
    transform: `translate(${sh.shiftX}%, ${sh.shiftY}%) scale(${sh.zoomX}, ${sh.zoomY})`,
    clipPath: sh.window ? `path('${windowPath(sh.window, W, H)}')` : 'none',
  }
}

export function TransitionSwatch({ name, active }: { name: string; active: boolean }) {
  const wrap = useRef<HTMLDivElement>(null)
  const a = useRef<HTMLDivElement>(null)
  const b = useRef<HTMLDivElement>(null)
  useLoop(active, (ms) => {
    const change = pageChange(name)
    if (!wrap.current || !a.current || !b.current) return
    const scene = ms < 0 || !change ? sceneOf(undefined, 1) : sceneOf(change, ((ms % (change.ms + 900)) - 300) / change.ms)
    // at rest only the "1" card shows
    const sheets = ms < 0 || !change ? [{ ...scene.sheets[0], side: 'outgoing' as const }] : scene.sheets
    wrap.current.style.background = scene.matte
    const els = { outgoing: a.current, incoming: b.current }
    for (const side of ['outgoing', 'incoming'] as const) {
      const i = sheets.findIndex((sh) => sh.side === side)
      Object.assign(els[side].style, sheetCss(sheets[i]), { zIndex: String(i + 1) })
    }
  })
  return (
    <div ref={wrap} className="relative overflow-hidden rounded-[8px]" style={{ width: W, height: H, background: '#000' }} aria-hidden>
      <div ref={a} className="absolute inset-0 bg-[#e8e4f3] flex items-center justify-center text-[12px] font-semibold text-[#5b4c86]">1</div>
      <div ref={b} className="absolute inset-0 bg-accent flex items-center justify-center text-[12px] font-semibold text-white" style={{ visibility: 'hidden' }}>2</div>
    </div>
  )
}
