import { Icon, RailIcon } from '@/components/icons'
import { useEffect, useRef, useState } from 'react'
import { Button, cx, Empty, SectionLabel, Slider, Spinner } from '@/components/ui/kit'
import type { ImageElement, ImageFilters, Page } from '@/doc/schema'
import { detachBackground, setAsBackground } from '@/features/photos/media'
import { cutOutSubject, canEnlarge, enlargePhoto, useJobs } from '@/features/photos/jobs'
import { imageNow, loadImage } from '@/render/assets'
import { filteredImage, hasFilters, PRESETS } from '@/render/filters'
import { defaultCrop } from '@/render/konva'
import { useEditor } from '@/stores/editor'
import { updateElement } from '../actions'
import { usePage, useSelected } from '../hooks'

type Adjust = { key: keyof ImageFilters; label: string; min: number; max: number }

const ADJUST: Adjust[] = [
  { key: 'brightness', label: 'Brightness', min: -100, max: 100 },
  { key: 'contrast', label: 'Contrast', min: -100, max: 100 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'hue', label: 'Hue', min: -180, max: 180 },
  { key: 'temperature', label: 'Temperature', min: -100, max: 100 },
  { key: 'blur', label: 'Blur', min: 0, max: 40 },
  { key: 'vignette', label: 'Vignette', min: 0, max: 100 },
  { key: 'noise', label: 'Grain', min: 0, max: 100 },
  { key: 'pixelate', label: 'Pixelate', min: 0, max: 40 },
]

function clean(f: ImageFilters): ImageFilters | undefined {
  const out: ImageFilters = {}
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== 0 && v !== false && v !== '') (out as Record<string, unknown>)[k] = v
  return Object.keys(out).length ? out : undefined
}

/** The loaded image for `src`, never a stale one from a previous src. */
function useLoaded(src: string) {
  const [loaded, setLoaded] = useState<{ src: string; img: HTMLImageElement } | null>(null)
  useEffect(() => {
    let live = true
    void loadImage(src).then((img) => live && setLoaded({ src, img })).catch(() => {})
    return () => {
      live = false
    }
  }, [src])
  return imageNow(src) ?? (loaded?.src === src ? loaded.img : null)
}

export default function PhotoTunePane() {
  const els = useSelected()
  const page = usePage()
  const el = els.find((e): e is ImageElement => e.type === 'image')
  if (!el) {
    if (page?.background.type === 'image') return <BackgroundPhoto page={page} />
    return <Empty title="Select a photo to edit it">Click a photo on the page to adjust its colors, crop it or remove its background.</Empty>
  }
  return <PhotoTools el={el} key={el.id} />
}

function BackgroundPhoto({ page }: { page: Page }) {
  const src = page.background.type === 'image' ? page.background.src : ''
  const img = useLoaded(src)
  return (
    <div className="flex flex-col">
      <SectionLabel>Page background</SectionLabel>
      <div className="rounded-tile border border-line bg-surface-2 overflow-hidden aspect-video">
        {img && <img src={img.src} alt="" className="w-full h-full object-cover" />}
      </div>
      <Button className="mt-3" onClick={() => void detachBackground(page)}><RailIcon name="background" size={16} />Detach background</Button>
      <p className="text-[12px] text-muted mt-2">Turns the background back into a photo you can move, crop and filter.</p>
    </div>
  )
}

function PhotoTools({ el }: { el: ImageElement }) {
  const img = useLoaded(el.src)
  const job = useJobs((s) => s[el.id])
  const filters = el.filters ?? {}
  const nw = img?.naturalWidth || el.naturalWidth
  const nh = img?.naturalHeight || el.naturalHeight

  const setFilters = (f: ImageFilters) => updateElement(el.id, { filters: clean(f) } as Partial<ImageElement>)
  const pickPreset = (key: string) => setFilters(key === 'none' ? {} : { preset: key, ...PRESETS[key].values })
  const activePreset = filters.preset ?? (hasFilters(filters) ? null : 'none')

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={() => useEditor.setState({ cropId: el.id })} disabled={el.locked}><Icon name="crop" size={15} />Crop</Button>
        <Button size="sm" onClick={() => setAsBackground(el)} disabled={el.locked}><RailIcon name="background" size={15} />Set as background</Button>
      </div>

      <SectionLabel>Magic tools</SectionLabel>
      <Button variant="soft" className="w-full" disabled={!!job || el.locked} onClick={() => void cutOutSubject(el)}>
        {job?.kind === 'bg' ? <Spinner /> : <Icon name="scissors" size={16} />}
        {job?.kind === 'bg' ? job.label : 'Remove background'}
        {job?.kind === 'bg' && job.progress !== undefined && <span className="tabular-nums opacity-70">{Math.round(job.progress * 100)}%</span>}
      </Button>
      <p className="text-[12px] text-muted mt-1.5">Worked out by your own computer, so the photo stays private. The first cut-out loads a 4.6 MB helper file.</p>

      <div className="mt-4 rounded-tile border border-line p-3">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink flex items-center gap-1.5"><Icon name="sparkle" size={15} />Enlarge</span>
          <span className="text-[12px] text-muted tabular-nums">{nw} × {nh} px</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-2.5">
          {[1.5, 2, 3].map((f) => {
            const ok = canEnlarge(nw, nh, f)
            return (
              <button
                key={f}
                disabled={!!job || !ok || el.locked}
                title={ok ? `${Math.round(nw * f)} × ${Math.round(nh * f)} px` : 'This photo is already too big for that'}
                onClick={() => void enlargePhoto(el, f)}
                className="h-8 rounded-lg border border-line text-[13px] hover:bg-hover disabled:opacity-40 disabled:hover:bg-transparent"
              >
                {f}×
              </button>
            )
          })}
        </div>
        {job?.kind === 'enlarge' && (
          <div className="mt-2.5">
            <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-accent transition-all" style={{ width: `${Math.round((job.progress ?? 0) * 100)}%` }} />
            </div>
            <p className="text-[12px] text-muted mt-1">{job.label}</p>
          </div>
        )}
        <p className="text-[12px] text-muted mt-2">Adds pixels so a small photo prints crisp. It keeps its size on the page.</p>
      </div>

      <SectionLabel>Filters</SectionLabel>
      <div className="grid grid-cols-3 gap-2">
        {Object.entries(PRESETS).map(([key, p]) => (
          <button key={key} onClick={() => pickPreset(key)} className="flex flex-col items-center gap-1 group" aria-pressed={activePreset === key}>
            <span className={cx('block w-full aspect-square rounded-tile overflow-hidden border-2 bg-surface-2', activePreset === key ? 'border-accent' : 'border-transparent group-hover:border-accent-line')}>
              {img && <FilterThumb img={img} el={el} values={p.values} />}
            </span>
            <span className={cx('text-[12px]', activePreset === key ? 'text-accent font-medium' : 'text-ink-2')}>{p.label}</span>
          </button>
        ))}
      </div>

      <SectionLabel action={hasFilters(filters) && <button className="text-[12px] text-accent" onClick={() => setFilters({})}>Reset</button>}>
        Adjust
      </SectionLabel>
      <div className="flex flex-col gap-3.5">
        {ADJUST.map((a) => (
          <Slider
            key={a.key}
            label={a.label}
            value={(filters[a.key] as number | undefined) ?? 0}
            min={a.min}
            max={a.max}
            onChange={(v) => setFilters({ ...filters, [a.key]: Math.max(a.min, Math.min(a.max, v)) })}
            onCommit={() => useEditor.getState().doc?.breakUndo()}
          />
        ))}
      </div>
      <div className="flex gap-2 mt-4">
        {(['grayscale', 'sepia', 'invert'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setFilters({ ...filters, [k]: !filters[k] })}
            aria-pressed={!!filters[k]}
            className={cx('flex-1 h-8 rounded-lg border text-[12px] capitalize', filters[k] ? 'border-accent text-accent bg-accent-wash' : 'border-line hover:bg-hover')}
          >
            {k === 'grayscale' ? 'Black & white' : k}
          </button>
        ))}
      </div>
    </div>
  )
}

const THUMB = 176

function FilterThumb({ img, el, values }: { img: HTMLImageElement; el: ImageElement; values: ImageFilters }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const crop = el.crop
  useEffect(() => {
    const c = crop ?? defaultCrop({ naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight, width: el.width, height: el.height })
    const side = Math.min(c.width, c.height)
    const sq = { x: c.x + (c.width - side) / 2, y: c.y + (c.height - side) / 2, width: side, height: side }
    // the square's size on the page, so blur and pixelate preview at the right strength
    const pageSide = side * (el.width / c.width)
    const out = filteredImage(img, `${el.src}#thumb`, sq, pageSide, pageSide, values, THUMB / pageSide)
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, THUMB, THUMB)
    ctx.drawImage(out, 0, 0, THUMB, THUMB)
  }, [img, crop, el.src, el.width, el.height, values])
  return <canvas ref={ref} width={THUMB} height={THUMB} className="block w-full h-full" />
}
