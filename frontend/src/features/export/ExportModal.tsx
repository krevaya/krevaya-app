import { Icon } from '@/components/icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Modal, Flyout } from '@/components/ui/Flyout'
import { Button, cx, ChoiceRow, SectionLabel, Slider, Toggle } from '@/components/ui/kit'
import type { ModalProps } from '@/editor/modals'
import type { Page } from '@/doc/schema'
import { abortError, nextFrame, pageDpi, pageInches } from '@/export/paper'
import { download, exportRaster, safeName } from '@/export/raster'
import { exportVideo, videoSupported, type VideoFormat } from '@/export/video'
import { useEditor } from '@/stores/editor'
import { isAbort, loadPrefs, PagePicker, choosePages, Progress, savePrefs, type PageMode } from './common'

type Kind = 'png' | 'jpg' | 'svg' | 'pdf' | 'pdf-print' | 'mp4' | 'webm' | 'gif'

const KINDS: Array<{ id: Kind; label: string; note: string; icon: ReactNode }> = [
  { id: 'png', label: 'PNG', note: 'Sharp image, best for graphics and text', icon: <Icon name="image" size={17} /> },
  { id: 'jpg', label: 'JPG', note: 'Small image file, best for photos', icon: <Icon name="camera" size={17} /> },
  { id: 'svg', label: 'SVG', note: 'Vector file that scales to any size', icon: <Icon name="pen" size={17} /> },
  { id: 'pdf', label: 'PDF Standard', note: 'For sharing, email and reading on screen', icon: <Icon name="doc-text" size={17} /> },
  { id: 'pdf-print', label: 'PDF Print', note: 'High quality for printing, with bleed and crop marks', icon: <Icon name="printer" size={17} /> },
  { id: 'mp4', label: 'MP4 video', note: 'Animated video that plays almost anywhere', icon: <Icon name="video" size={17} /> },
  { id: 'webm', label: 'WebM video', note: 'Open video format for the web', icon: <Icon name="clapper" size={17} /> },
  { id: 'gif', label: 'GIF', note: 'Short looping animation without sound', icon: <Icon name="frames" size={17} /> },
]

const isVideo = (k: Kind): k is VideoFormat => k === 'mp4' || k === 'webm' || k === 'gif'

/** What most people want for this kind of design: print sizes go to print, moving designs to video. */
function suggestKind(pages: Page[], audio: boolean): Kind {
  if (!pages.length) return 'png'
  const moving = audio || pages.some((pg) => pg.transition || pg.elements.some((el) => el.anim?.enter || el.anim?.exit || el.anim?.emphasis))
  if (moving && videoSupported('mp4')) return 'mp4'
  if (pages.every((pg) => pageDpi(pg) !== 96)) return 'pdf-print'
  if (pages.length > 2) return 'pdf'
  return 'png'
}

type Prefs = {
  kind: Kind
  scale: number
  transparent: boolean
  quality: number
  pages: PageMode
  custom: string
  /** The type picked last time for each kind of design, keyed by the suggestion. */
  picked?: Partial<Record<Kind, Kind>>
  bleed: boolean
  bleedMm: number
  cropMarks: boolean
  res: 720 | 1080
  fps: number
  gifFps: number
}

const SETTINGS_STORE_KEY = 'krevaya-app.download'
const DEFAULTS: Prefs = {
  kind: 'png', scale: 1, transparent: false, quality: 85, pages: 'all', custom: '',
  bleed: true, bleedMm: 3, cropMarks: true, res: 1080, fps: 30, gifFps: 15,
}
const MAX_SIDE = 16000

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export default function ExportModal({ onClose }: ModalProps) {
  const doc = useEditor((s) => s.doc)
  const title = useEditor((s) => s.title)
  const pageId = useEditor((s) => s.pageId)
  const [suggested] = useState(() => {
    const snap = doc?.getSnapshot()
    return suggestKind(snap?.pages ?? [], !!snap?.settings.audio?.length)
  })
  const [p, setP] = useState<Prefs>(() => {
    const saved = loadPrefs(SETTINGS_STORE_KEY, DEFAULTS)
    saved.kind = saved.picked?.[suggested] ?? suggested
    if (!KINDS.some((k) => k.id === saved.kind) || (isVideo(saved.kind) && !videoSupported(saved.kind))) saved.kind = 'png'
    return saved
  })
  const [busy, setBusy] = useState<{ fraction: number; label: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ac = useRef<AbortController | null>(null)
  const set = (patch: Partial<Prefs>) => {
    setError(null)
    setP((old) => ({ ...old, ...patch }))
  }

  useEffect(() => () => ac.current?.abort(), [])

  const all = doc?.getSnapshot().pages ?? []
  const chosen = choosePages(all, p.pages, p.custom)
  const sample: Page | undefined = chosen[0] ?? all.find((x) => x.id === pageId) ?? all[0]
  const maxScale = sample ? Math.min(3, MAX_SIDE / Math.max(sample.width, sample.height)) : 3
  const scale = Math.min(p.scale, maxScale)
  const kind = KINDS.find((k) => k.id === p.kind)!
  const zipped = chosen.length > 1 && (p.kind === 'png' || p.kind === 'jpg' || p.kind === 'svg')

  const close = () => {
    ac.current?.abort()
    onClose()
  }

  async function run() {
    if (!doc || busy) return
    const pages = chosen
    if (!pages.length) {
      setError('Pick a page or two first.')
      return
    }
    savePrefs(SETTINGS_STORE_KEY, p)
    const ctl = new AbortController()
    ac.current = ctl
    const signal = ctl.signal
    const name = safeName(title)
    const number = (pg: Page) => all.indexOf(pg) + 1
    const step = (i: number, n: number, verb = 'Rendering') => setBusy({ fraction: i / n, label: n > 1 ? `${verb} page ${i + 1} of ${n}` : `${verb} page` })
    setError(null)
    setBusy({ fraction: 0, label: 'Warming up' })
    try {
      if (p.kind === 'png' || p.kind === 'jpg' || p.kind === 'svg') {
        const ext = p.kind
        const files: Array<{ name: string; data: Blob | string }> = []
        const svgMod = ext === 'svg' ? await import('@/export/svg') : null
        for (let i = 0; i < pages.length; i++) {
          if (signal.aborted) throw abortError()
          step(i, pages.length)
          await nextFrame()
          const pg = pages[i]
          const data = svgMod
            ? await svgMod.exportSvg(pg)
            : await exportRaster(pg, ext as 'png' | 'jpg', scale, p.quality / 100, p.transparent && ext === 'png')
          files.push({ name: pages.length > 1 ? `${name}-${number(pg)}.${ext}` : `${name}.${ext}`, data })
        }
        if (signal.aborted) throw abortError()
        if (files.length === 1) {
          const f = files[0]
          download(typeof f.data === 'string' ? new Blob([f.data], { type: 'image/svg+xml' }) : f.data, f.name)
        } else {
          setBusy({ fraction: 1, label: 'Zipping files' })
          const { zipFiles } = await import('./zip')
          download(await zipFiles(files, ext === 'svg'), `${name}.zip`)
        }
      } else if (p.kind === 'pdf' || p.kind === 'pdf-print') {
        const { exportPdf } = await import('@/export/pdf')
        const print = p.kind === 'pdf-print'
        step(0, pages.length)
        const blob = await exportPdf(pages, {
          title: title || 'Design',
          print: print ? { bleedMm: p.bleed ? p.bleedMm : 0, cropMarks: p.cropMarks } : null,
          signal,
          onProgress: (f) => {
            const i = Math.min(pages.length - 1, Math.round(f * pages.length))
            setBusy({ fraction: f, label: f >= 1 ? 'Saving PDF' : `Rendering page ${i + 1} of ${pages.length}` })
          },
        })
        if (signal.aborted) throw abortError()
        download(blob, `${name}.pdf`)
      } else if (isVideo(p.kind)) {
        const ratio = sample ? sample.width / sample.height : 16 / 9
        const even = (v: number) => Math.max(2, Math.round(v / 2) * 2)
        const width = ratio >= 1 ? even(p.res * ratio) : even(p.res)
        const blob = await exportVideo(doc.getSnapshot(), {
          format: p.kind,
          width,
          fps: p.kind === 'gif' ? p.gifFps : p.fps,
          pages: pages.map((x) => x.id),
          signal,
          onProgress: (f) => setBusy({ fraction: f, label: p.kind === 'gif' ? 'Making your GIF' : 'Recording video' }),
        })
        if (signal.aborted) throw abortError()
        download(blob, `${name}.${p.kind}`)
      }
      setBusy(null)
      onClose()
    } catch (e) {
      setBusy(null)
      if (!isAbort(e)) setError(e instanceof Error && e.message ? e.message : 'Something went wrong while exporting.')
    } finally {
      if (ac.current === ctl) ac.current = null
    }
  }

  const footer = busy ? (
    <Progress fraction={busy.fraction} label={busy.label} onCancel={() => ac.current?.abort()} />
  ) : (
    <Button variant="primary" className="w-full" onClick={run} disabled={!chosen.length}>
      Download{zipped ? ` ${plural(chosen.length, 'page')} as .zip` : ''}
    </Button>
  )

  return (
    <Modal open onClose={close} title="Download" width={460} footer={footer}>
      <fieldset disabled={!!busy} className="flex flex-col min-w-0 border-0 p-0 m-0">
        <SectionLabel>File type</SectionLabel>
        <KindPicker value={p.kind} suggested={suggested} onChange={(k) => set({ kind: k, picked: { ...p.picked, [suggested]: k } })} disabled={!!busy} />

        {(p.kind === 'png' || p.kind === 'jpg') && sample && (
          <>
            <SectionLabel action={<span className="text-[12px] text-muted tabular-nums">{Math.round(sample.width * scale)} × {Math.round(sample.height * scale)} px</span>}>
              Size
            </SectionLabel>
            <Slider label="Scale" value={scale} min={0.5} max={maxScale} step={0.25} onChange={(v) => set({ scale: Math.max(0.5, Math.min(maxScale, v)) })} />
            {p.kind === 'png' && (
              <div className="mt-4">
                <Toggle label="Transparent background" checked={p.transparent} onChange={(v) => set({ transparent: v })} />
              </div>
            )}
            {p.kind === 'jpg' && (
              <div className="mt-4">
                <Slider label="Quality" value={p.quality} min={10} max={100} step={1} onChange={(v) => set({ quality: Math.max(10, Math.min(100, v)) })} />
              </div>
            )}
          </>
        )}

        {p.kind === 'svg' && (
          <p className="mt-3 text-[12px] text-muted leading-relaxed">Shapes, lines and text stay as vectors and fonts are embedded. Photos with filters are saved as images.</p>
        )}

        {p.kind === 'pdf' && sample && <PaperNote page={sample} />}

        {p.kind === 'pdf-print' && sample && (
          <>
            <PaperNote page={sample} />
            <SectionLabel>Print options</SectionLabel>
            <div className="flex flex-col gap-3">
              <Toggle label="Bleed" checked={p.bleed} onChange={(v) => set({ bleed: v })} />
              {p.bleed && (
                <Slider label="Bleed size (mm)" value={p.bleedMm} min={1} max={10} step={0.5} onChange={(v) => set({ bleedMm: Math.max(0, Math.min(25, v)) })} />
              )}
              <Toggle label="Crop marks" checked={p.cropMarks} onChange={(v) => set({ cropMarks: v })} />
              <p className="text-[12px] text-muted leading-relaxed">Bleed extends the background past the edge so there are no white slivers after trimming. Keep text away from the edges.</p>
            </div>
          </>
        )}

        {isVideo(p.kind) && (
          <>
            <SectionLabel>Resolution</SectionLabel>
            <ChoiceRow<'720' | '1080'> value={String(p.res) as '720' | '1080'} onChange={(v) => set({ res: Number(v) as 720 | 1080 })} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }]} />
            <SectionLabel>Frame rate</SectionLabel>
            {p.kind === 'gif' ? (
              <ChoiceRow<string> value={String(p.gifFps)} onChange={(v) => set({ gifFps: Number(v) })} options={[10, 15, 20].map((f) => ({ value: String(f), label: `${f} fps` }))} />
            ) : (
              <ChoiceRow<string> value={String(p.fps)} onChange={(v) => set({ fps: Number(v) })} options={[24, 30, 60].map((f) => ({ value: String(f), label: `${f} fps` }))} />
            )}
          </>
        )}

        <SectionLabel>Pages</SectionLabel>
        <PagePicker mode={p.pages} custom={p.custom} count={all.length} onMode={(m) => set({ pages: m })} onCustom={(s) => set({ custom: s })} />
        {zipped && <p className="mt-2 text-[12px] text-muted">Each page is saved as its own file, together in a .zip.</p>}

        {error && <p className="mt-4 text-[13px] text-danger" role="alert">{error}</p>}
        <span className="sr-only">{kind.label} selected</span>
      </fieldset>
    </Modal>
  )
}

function PaperNote({ page }: { page: Page }) {
  const inch = pageInches(page)
  const mm = (v: number) => Math.round(v * 25.4)
  const fmt = (v: number) => (Math.round(v * 100) / 100).toString()
  return (
    <p className="mt-3 text-[12px] text-muted">
      Page size {fmt(inch.width)} × {fmt(inch.height)} in ({mm(inch.width)} × {mm(inch.height)} mm)
    </p>
  )
}

function KindPicker({ value, suggested, onChange, disabled }: { value: Kind; suggested: Kind; onChange: (k: Kind) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const cur = KINDS.find((k) => k.id === value)!
  const anyVideoOff = KINDS.some((k) => isVideo(k.id) && !videoSupported(k.id))
  return (
    <>
      <button
        ref={btn}
        disabled={disabled}
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="w-full h-14 px-3 flex items-center gap-3 rounded-control border border-line-2 bg-surface hover:bg-hover text-left disabled:opacity-50"
      >
        <span className="h-9 w-9 rounded-lg bg-accent-wash text-accent flex items-center justify-center shrink-0">{cur.icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-medium text-ink">{cur.label}</span>
          <span className="block text-[12px] text-muted truncate">{cur.note}</span>
        </span>
        <Icon name="chevron-down" size={16} className="text-muted shrink-0" />
      </button>
      <Flyout anchor={btn.current} open={open} onClose={() => setOpen(false)} place="bottom-start" className="w-[420px] max-w-[calc(100vw-32px)] p-1.5">
        <div role="listbox" aria-label="File type" className="flex flex-col max-h-[60vh] overflow-y-auto scroll-thin">
          {KINDS.map((k) => {
            const off = isVideo(k.id) && !videoSupported(k.id)
            const active = k.id === value
            return (
              <button
                key={k.id}
                role="option"
                aria-selected={active}
                disabled={off}
                onClick={() => {
                  onChange(k.id)
                  setOpen(false)
                }}
                className={cx(
                  'flex items-center gap-3 px-2.5 py-2 rounded-lg text-left disabled:opacity-45 disabled:cursor-not-allowed',
                  active ? 'bg-accent-wash' : 'hover:bg-hover',
                )}
              >
                <span className={cx('shrink-0', active ? 'text-accent' : 'text-muted')}>{k.icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
                    {k.label}
                    {k.id === suggested && <span className="text-[10px] font-medium px-1.5 py-px rounded-full bg-accent-wash text-accent border border-accent-line">Suggested</span>}
                  </span>
                  <span className="block text-[12px] text-muted">{k.note}</span>
                </span>
                {active && <Icon name="check" size={15} className="text-accent shrink-0" />}
              </button>
            )
          })}
          {anyVideoOff && (
            <p className="px-2.5 pt-2 pb-1.5 mt-1 border-t border-line text-[12px] text-muted">Video and GIF downloads aren't available in this browser yet.</p>
          )}
        </div>
      </Flyout>
    </>
  )
}
