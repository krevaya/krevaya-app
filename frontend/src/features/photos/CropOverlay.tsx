import { Icon } from '@/components/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, cx } from '@/components/ui/kit'
import type { ImageElement } from '@/doc/schema'
import { updateElement } from '@/editor/actions'
import type { OverlayProps } from '@/editor/canvas/hooks'
import { usePage } from '@/editor/hooks'
import { clamp, rad } from '@/lib/math'
import { imageNow, loadImage } from '@/render/assets'
import { cssFilter } from '@/render/filters'
import { defaultCrop } from '@/render/konva'
import { canEdit, useEditor } from '@/stores/editor'

// Everything here is in the element's own frame: page units from its top-left
// corner, before rotation. Flips are undone only when the crop is written.

type Rect = { x: number; y: number; w: number; h: number }
type State = { img: Rect; box: Rect; zoom: number }
type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const ASPECTS: Array<{ id: string; label: string }> = [
  { id: 'free', label: 'Free' },
  { id: 'original', label: 'Original' },
  { id: '1:1', label: '1:1' },
  { id: '4:5', label: '4:5' },
  { id: '16:9', label: '16:9' },
]

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function CropOverlay({ engine, view }: OverlayProps) {
  const cropId = useEditor((s) => s.cropId)
  const role = useEditor((s) => s.role)
  const page = usePage()
  const el = cropId ? page?.elements.find((e) => e.id === cropId) : undefined
  useEffect(() => {
    if (cropId && (!el || el.type !== 'image' || !canEdit(role))) useEditor.setState({ cropId: null })
  }, [cropId, el, role])
  if (!el || el.type !== 'image' || !canEdit(role)) return null
  return <Cropper key={el.id} el={el} engine={engine} view={view} />
}

function Cropper({ el, engine, view }: { el: ImageElement } & OverlayProps) {
  const [img, setImg] = useState<HTMLImageElement | null>(() => imageNow(el.src))
  useEffect(() => {
    if (!img) void loadImage(el.src).then(setImg).catch(() => useEditor.setState({ cropId: null }))
  }, [img, el.src])
  if (!img) return null
  return <CropBox el={el} img={img} engine={engine} view={view} />
}

function CropBox({ el, img, engine }: { el: ImageElement; img: HTMLImageElement } & OverlayProps) {
  const nw = img.naturalWidth || el.naturalWidth
  const nh = img.naturalHeight || el.naturalHeight
  const W0 = el.width
  const H0 = el.height
  // Scale at zoom 1: page units per source pixel.
  const base = useMemo(() => {
    const c = el.crop ?? defaultCrop({ naturalWidth: nw, naturalHeight: nh, width: W0, height: H0 })
    return { c, sx: W0 / c.width, sy: H0 / c.height }
  }, [el.crop, nw, nh, W0, H0])

  const [st, setSt] = useState<State>(() => {
    const { c, sx, sy } = base
    const iw = nw * sx
    const ih = nh * sy
    let ix = -c.x * sx
    let iy = -c.y * sy
    if (el.flipX) ix = W0 - (ix + iw)
    if (el.flipY) iy = H0 - (iy + ih)
    return { img: { x: ix, y: iy, w: iw, h: ih }, box: { x: 0, y: 0, w: W0, h: H0 }, zoom: 1 }
  })
  const [aspect, setAspect] = useState('free')
  const stRef = useRef(st)
  stRef.current = st

  const box = engine.screenBox(el)
  const z = box.zoom
  const rot = el.rotation || 0

  const ratioFor = (id: string, s: State): number | null => {
    if (id === 'original') return s.img.w / s.img.h
    if (id === 'free') return null
    const [a, b] = id.split(':').map(Number)
    return a / b
  }
  const ratio = ratioFor(aspect, st)

  const apply = () => {
    const { img: im, box: b, zoom } = stRef.current
    const sx = base.sx * zoom
    const sy = base.sy * zoom
    const bx = el.flipX ? W0 - b.x - b.w : b.x
    const by = el.flipY ? H0 - b.y - b.h : b.y
    const ix = el.flipX ? W0 - im.x - im.w : im.x
    const iy = el.flipY ? H0 - im.y - im.h : im.y
    const cw = Math.min(nw, b.w / sx)
    const ch = Math.min(nh, b.h / sy)
    const crop = {
      x: r2(clamp((bx - ix) / sx, 0, nw - cw)),
      y: r2(clamp((by - iy) / sy, 0, nh - ch)),
      width: r2(cw),
      height: r2(ch),
    }
    const cos = Math.cos(rad(rot))
    const sin = Math.sin(rad(rot))
    useEditor.getState().doc?.breakUndo()
    updateElement(el.id, {
      x: r2(el.x + b.x * cos - b.y * sin),
      y: r2(el.y + b.x * sin + b.y * cos),
      width: r2(b.w),
      height: r2(b.h),
      crop,
    } as Partial<ImageElement>)
    useEditor.setState({ cropId: null })
  }
  const cancel = () => useEditor.setState({ cropId: null })
  const applyRef = useRef(apply)
  applyRef.current = apply

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        cancel()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        applyRef.current()
      } else if (e.key === 'Backspace' || e.key === 'Delete' || (e.metaKey || e.ctrlKey)) {
        // keep editor shortcuts from acting on the element mid-crop
        e.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Screen delta -> element frame delta.
  const toLocal = (dx: number, dy: number) => {
    const r = rad(-rot)
    return { x: (dx * Math.cos(r) - dy * Math.sin(r)) / z, y: (dx * Math.sin(r) + dy * Math.cos(r)) / z }
  }

  const drag = (e: React.PointerEvent, onMove: (d: { x: number; y: number }, start: State) => State) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    const start = stRef.current
    const sx = e.clientX
    const sy = e.clientY
    const move = (ev: PointerEvent) => setSt(onMove(toLocal(ev.clientX - sx, ev.clientY - sy), start))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const moveImage = (e: React.PointerEvent) =>
    drag(e, (d, s) => ({ ...s, img: clampImg({ ...s.img, x: s.img.x + d.x, y: s.img.y + d.y }, s.box) }))

  const resize = (h: Handle) => (e: React.PointerEvent) =>
    drag(e, (d, s) => ({ ...s, box: resizeBox(s.box, s.img, h, d, ratio, 12 / z) }))

  const setZoom = (zoom: number) => {
    setSt((s) => {
      const min = minZoom(s)
      const zz = clamp(zoom, min, 6)
      const k = zz / s.zoom
      const cx = s.box.x + s.box.w / 2
      const cy = s.box.y + s.box.h / 2
      const im = { x: cx - (cx - s.img.x) * k, y: cy - (cy - s.img.y) * k, w: s.img.w * k, h: s.img.h * k }
      return { ...s, zoom: zz, img: clampImg(im, s.box) }
    })
  }
  const minZoom = (s: State) => s.zoom * Math.max(s.box.w / s.img.w, s.box.h / s.img.h)

  const pickAspect = (id: string) => {
    setAspect(id)
    const s = stRef.current
    const r = ratioFor(id, s)
    if (!r) return
    // fit the ratio inside the frame the photo had when cropping began, so trying
    // presets one after another doesn't keep shrinking the box
    const w = Math.min(W0, H0 * r)
    const h = w / r
    setSt({ ...s, box: clampBox({ x: (W0 - w) / 2, y: (H0 - h) / 2, w, h }, s.img) })
  }

  const { img: im, box: b } = st
  const flip = `scale(${el.flipX ? -1 : 1}, ${el.flipY ? -1 : 1})`
  const zMin = minZoom(st)

  return (
    <>
      <div
        className="absolute inset-0 z-[6]"
        onPointerDown={(e) => {
          if (e.button === 0) applyRef.current()
        }}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            const zz = Math.min(8, Math.max(0.05, engine.view.zoom * Math.exp(-e.deltaY * 0.01)))
            const rect = engine.stage.container().getBoundingClientRect()
            engine.zoomTo(zz, { x: e.clientX - rect.left, y: e.clientY - rect.top })
            useEditor.setState({ zoom: zz, autoFit: false })
          } else engine.pan(e.deltaX, e.deltaY)
        }}
      />
      <div
        className="absolute z-[7]"
        style={{ left: box.x, top: box.y, width: 0, height: 0, transform: `rotate(${rot}deg)`, transformOrigin: '0 0' }}
        onDoubleClick={() => applyRef.current()}
      >
        <div
          className="absolute overflow-hidden cursor-move touch-none"
          style={{ left: im.x * z, top: im.y * z, width: im.w * z, height: im.h * z }}
          onPointerDown={moveImage}
        >
          <img
            src={img.src}
            alt=""
            draggable={false}
            className="absolute inset-0 w-full h-full max-w-none select-none pointer-events-none"
            style={{ transform: flip, filter: cssFilter(el.filters) || undefined }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              left: (b.x - im.x) * z, top: (b.y - im.y) * z, width: b.w * z, height: b.h * z,
              boxShadow: '0 0 0 100000px rgba(22, 18, 34, 0.55)',
            }}
          />
        </div>
        <div className="absolute pointer-events-none" style={{ left: b.x * z, top: b.y * z, width: b.w * z, height: b.h * z }}>
          <div className="absolute inset-0 border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/45" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/45" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/45" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/45" />
          {HANDLES.map((h) => (
            <span
              key={h}
              onPointerDown={resize(h)}
              className={cx('absolute pointer-events-auto touch-none bg-white border border-accent shadow', handleClass(h))}
              style={handleStyle(h)}
              aria-hidden
            />
          ))}
        </div>
      </div>
      <div className="absolute left-3 right-3 top-3 z-10 flex justify-center pointer-events-none">
        <div
          className="pointer-events-auto max-w-full overflow-x-auto scroll-thin flex items-center gap-1 h-12 px-2 rounded-control border border-line bg-surface shadow-card"
          role="toolbar"
          aria-label="Crop"
        >
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              onClick={() => pickAspect(a.id)}
              aria-pressed={aspect === a.id}
              className={cx('h-8 px-2.5 rounded-lg text-[13px] shrink-0', aspect === a.id ? 'bg-accent-wash text-accent font-medium' : 'text-ink-2 hover:bg-hover')}
            >
              {a.label}
            </button>
          ))}
          <span className="w-px h-6 bg-line mx-1 shrink-0" />
          <label className="flex items-center gap-2 text-[13px] text-ink-2 px-1 shrink-0">
            Zoom
            <input
              type="range"
              aria-label="Zoom photo"
              min={0}
              max={1}
              step={0.001}
              value={zoomToSlider(st.zoom, zMin)}
              onChange={(e) => setZoom(sliderToZoom(Number(e.target.value), zMin))}
              className="w-24"
            />
          </label>
          <span className="w-px h-6 bg-line mx-1 shrink-0" />
          <Button size="sm" variant="ghost" onClick={cancel}><Icon name="x" size={15} />Cancel</Button>
          <Button size="sm" variant="primary" onClick={() => applyRef.current()}><Icon name="check" size={15} />Done</Button>
        </div>
      </div>
    </>
  )
}

const r2 = (v: number) => Math.round(v * 100) / 100

// Slider is logarithmic between the smallest zoom that still covers the box and 6x.
function zoomToSlider(zoom: number, min: number) {
  if (min >= 6) return 0
  return clamp(Math.log(zoom / min) / Math.log(6 / min), 0, 1)
}
function sliderToZoom(t: number, min: number) {
  return min * Math.pow(6 / min, t)
}

function clampImg(im: Rect, box: Rect): Rect {
  return {
    ...im,
    x: clamp(im.x, box.x + box.w - im.w, box.x),
    y: clamp(im.y, box.y + box.h - im.h, box.y),
  }
}

function clampBox(b: Rect, im: Rect): Rect {
  const w = Math.min(b.w, im.w)
  const h = Math.min(b.h, im.h)
  return { w, h, x: clamp(b.x, im.x, im.x + im.w - w), y: clamp(b.y, im.y, im.y + im.h - h) }
}

function resizeBox(start: Rect, im: Rect, handle: Handle, d: { x: number; y: number }, ratio: number | null, min: number): Rect {
  const dirX = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0
  const dirY = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0
  const ax = dirX === 1 ? start.x : dirX === -1 ? start.x + start.w : start.x + start.w / 2
  const ay = dirY === 1 ? start.y : dirY === -1 ? start.y + start.h : start.y + start.h / 2
  let w = dirX ? start.w + dirX * d.x : start.w
  let h = dirY ? start.h + dirY * d.y : start.h
  const maxW = dirX === 1 ? im.x + im.w - ax : dirX === -1 ? ax - im.x : 2 * Math.min(ax - im.x, im.x + im.w - ax)
  const maxH = dirY === 1 ? im.y + im.h - ay : dirY === -1 ? ay - im.y : 2 * Math.min(ay - im.y, im.y + im.h - ay)
  if (ratio) {
    if (dirX && dirY) {
      if (w / ratio > h) h = w / ratio
      else w = h * ratio
    } else if (dirX) h = w / ratio
    else w = h * ratio
    if (w < min || h < min) {
      const k = Math.max(min / w, min / h)
      w *= k
      h *= k
    }
    const k = Math.min(1, maxW / w, maxH / h)
    w *= k
    h *= k
  } else {
    w = clamp(w, Math.min(min, maxW), maxW)
    h = clamp(h, Math.min(min, maxH), maxH)
  }
  return {
    w, h,
    x: dirX === 1 ? ax : dirX === -1 ? ax - w : ax - w / 2,
    y: dirY === 1 ? ay : dirY === -1 ? ay - h : ay - h / 2,
  }
}

function handleClass(h: Handle) {
  const corner = h.length === 2
  const cursor = { n: 'cursor-ns-resize', s: 'cursor-ns-resize', e: 'cursor-ew-resize', w: 'cursor-ew-resize', ne: 'cursor-nesw-resize', sw: 'cursor-nesw-resize', nw: 'cursor-nwse-resize', se: 'cursor-nwse-resize' }[h]
  return cx(cursor, corner ? 'h-3.5 w-3.5 rounded-full' : h === 'n' || h === 's' ? 'h-2 w-6 rounded-full' : 'h-6 w-2 rounded-full')
}

function handleStyle(h: Handle): React.CSSProperties {
  const x = h.includes('w') ? '0%' : h.includes('e') ? '100%' : '50%'
  const y = h.includes('n') ? '0%' : h.includes('s') ? '100%' : '50%'
  return { left: x, top: y, transform: 'translate(-50%, -50%)' }
}
