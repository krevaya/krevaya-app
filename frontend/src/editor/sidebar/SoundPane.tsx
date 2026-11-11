import { Icon } from '@/components/icons'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, upload } from '@/api/client'
import { BED_ITEMS, BED_USES, CUE_ITEMS, CUE_SHELF_TITLES, synthBuiltin, type BedItem } from '@/audio/builtin'
import { trackBuffer } from '@/audio/mix'
import { audioContext, previewBuffer, previewUrl, stopPreview } from '@/audio/player'
import { Button, Chip, cx, Empty, GlyphButton, Input, SectionLabel, ChoiceRow, Slider, Spinner, Toggle } from '@/components/ui/kit'
import type { AudioTrack, DesignDoc } from '@/doc/schema'
import { uid } from '@/lib/id'
import { designDuration, pageRunTime } from '@/motion/timeline'
import { listLocalBlobs, putLocalBlob, resolveLocal } from '@/persistence/local'
import { useAuth } from '@/stores/auth'
import { canEdit, useEditor } from '@/stores/editor'
import { useDoc, usePage } from '../hooks'

type Tab = 'music' | 'sfx' | 'yours'

// helpers

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function tracksOf(doc: DesignDoc): AudioTrack[] {
  return doc.settings.audio ?? []
}

function setTracks(tracks: AudioTrack[]) {
  const s = useEditor.getState()
  if (!s.doc || !canEdit(s.role)) return
  s.doc.setSetting('audio', tracks)
}

function addTrack(t: Omit<AudioTrack, 'id'>) {
  const doc = useEditor.getState().doc
  if (!doc) return
  setTracks([...tracksOf(doc.getSnapshot()), { ...t, id: uid() }])
}

function updateTrack(id: string, patch: Partial<AudioTrack>) {
  const doc = useEditor.getState().doc
  if (!doc) return
  setTracks(tracksOf(doc.getSnapshot()).map((t) => (t.id === id ? { ...t, ...patch } : t)))
}

function removeTrack(id: string) {
  const doc = useEditor.getState().doc
  if (!doc) return
  setTracks(tracksOf(doc.getSnapshot()).filter((t) => t.id !== id))
}

/** Where the current page starts on the design timeline, in ms. */
function pageStart(doc: DesignDoc, pageId: string | undefined) {
  let t = 0
  for (const p of doc.pages) {
    if (p.id === pageId) break
    t += pageRunTime(p)
  }
  return t
}

/** Save an audio file where this user keeps uploads; returns the src for a track. */
async function storeAudio(file: File): Promise<string> {
  if (useEditor.getState().guest) return putLocalBlob(file, file.name)
  const res = await upload<{ url: string }>('/api/assets', file)
  return res.url
}

/** One preview at a time; remembers which row is playing or loading. */
function usePreview() {
  const [playing, setPlaying] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  useEffect(() => () => stopPreview(), [])
  const toggle = (id: string, start: (done: () => void) => (() => void) | void, slow?: Promise<unknown>) => {
    if (playing === id) {
      stopPreview()
      setPlaying(null)
      return
    }
    setPlaying(id)
    if (slow) {
      setLoading(id)
      slow.finally(() => setLoading((l) => (l === id ? null : l)))
    }
    start(() => setPlaying((p) => (p === id ? null : p)))
  }
  return { playing, loading, toggle }
}

type Preview = ReturnType<typeof usePreview>

function PlayButton({ id, preview, onPlay, label }: { id: string; preview: Preview; onPlay: () => void; label: string }) {
  const on = preview.playing === id
  return (
    <button
      onClick={onPlay}
      aria-label={on ? `Stop ${label}` : `Play ${label}`}
      title={on ? 'Stop' : 'Play'}
      className={cx(
        'h-8 w-8 shrink-0 rounded-full flex items-center justify-center transition border',
        on ? 'bg-accent text-white border-transparent' : 'bg-surface border-line-2 text-ink-2 hover:border-accent-line hover:text-accent',
      )}
    >
      {preview.loading === id ? <Spinner className="h-3.5 w-3.5 border-white/40 border-t-white" /> : on ? <Icon name="stop" size={11} filled /> : <Icon name="play" size={13} filled className="ml-0.5" />}
    </button>
  )
}

function Row({ play, title, meta, action }: { play: ReactNode; title: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-control hover:bg-hover group">
      {play}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] text-ink truncate">{title}</p>
        {meta && <p className="text-[11px] text-muted truncate">{meta}</p>}
      </div>
      {action}
    </div>
  )
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <GlyphButton label={label} size="sm" onClick={onClick} className="opacity-70 group-hover:opacity-100">
      <Icon name="plus" size={16} />
    </GlyphButton>
  )
}

// Music

const ENERGY: Record<BedItem['energy'], string> = { 1: 'Gentle', 2: 'Steady', 3: 'Lively' }

function EnergyMeter({ level }: { level: BedItem['energy'] }) {
  return (
    <span className="inline-flex items-end gap-[2px] h-2.5 mr-1.5 align-[-1px]" aria-hidden>
      {[1, 2, 3].map((n) => (
        <span key={n} className={cx('w-[3px] rounded-sm', n <= level ? 'bg-accent' : 'bg-line-2')} style={{ height: `${3 + n * 2.5}px` }} />
      ))}
    </span>
  )
}

function MusicTab({ preview }: { preview: Preview }) {
  const [q, setQ] = useState('')
  const [use, setUse] = useState('')
  const needle = q.toLowerCase()
  const list = BED_ITEMS.filter((m) => (!use || m.use === use) && (!q || `${m.title} ${m.use} ${ENERGY[m.energy]}`.toLowerCase().includes(needle)))
  return (
    <div className="flex flex-col">
      <Input icon={<Icon name="search" size={16} />} placeholder="Search music" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap gap-1.5 py-3">
        <Chip active={!use} onClick={() => setUse('')}>Everything</Chip>
        {BED_USES.map((u) => <Chip key={u} active={use === u} onClick={() => setUse(u)}>{u}</Chip>)}
      </div>
      {list.map((m) => (
        <Row
          key={m.ref}
          play={<PlayButton id={m.ref} label={m.title} preview={preview} onPlay={() => {
            const buf = synthBuiltin(m.ref, audioContext().sampleRate)
            preview.toggle(m.ref, (done) => previewBuffer(buf, done), buf)
          }} />}
          title={m.title}
          meta={<><EnergyMeter level={m.energy} />{ENERGY[m.energy]}{use ? '' : ` · ${m.use}`} · {fmt(m.lengthMs)}</>}
          action={<AddButton label={`Add ${m.title}`} onClick={() => addTrack({ kind: 'loop', name: m.title, preset: m.ref, start: 0, loop: true, volume: 0.6, fadeIn: 0, fadeOut: 1500 })} />}
        />
      ))}
      {!list.length && <Empty title="Nothing by that name">Try a different word, or pick another use.</Empty>}
      <p className="text-[12px] text-muted mt-3 leading-relaxed">Every track is generated in your browser and is yours to use anywhere (CC0). It keeps repeating until your design ends.</p>
    </div>
  )
}

// Sound effects


type Sound = { id: number; name: string; duration: number; license: string; author: string; link: string; url: string }

function licenseLabel(url: string) {
  if (/zero|publicdomain/i.test(url)) return 'CC0'
  if (/by-nc/i.test(url)) return 'CC BY-NC'
  if (/by\//i.test(url) || /attribution/i.test(url)) return 'CC BY'
  return 'License'
}

function useStockSounds() {
  const user = useAuth((s) => s.user)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!user) return
    let live = true
    api<{ sounds?: boolean }>('/api/stock/config').then((c) => live && setOn(!!c.sounds)).catch(() => {})
    return () => {
      live = false
    }
  }, [user])
  return on && !!user
}

function SfxTab({ preview, startMs }: { preview: Preview; startMs: number }) {
  const [q, setQ] = useState('')
  const [shelf, setShelf] = useState('')
  const stock = useStockSounds()
  const list = CUE_ITEMS.filter((s) => (!shelf || s.shelf === shelf) && (!q || `${s.title} ${s.shelf}`.toLowerCase().includes(q.toLowerCase())))
  const groups = useMemo(() => {
    const m = new Map<string, typeof CUE_ITEMS>()
    for (const s of list) m.set(s.shelf, [...(m.get(s.shelf) ?? []), s])
    return [...m]
  }, [list])
  return (
    <div className="flex flex-col">
      <Input icon={<Icon name="search" size={16} />} placeholder="Search sound effects" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="flex flex-wrap gap-1.5 py-3">
        <Chip active={!shelf} onClick={() => setShelf('')}>Everything</Chip>
        {CUE_SHELF_TITLES.map((c) => <Chip key={c} active={shelf === c} onClick={() => setShelf(c)}>{c}</Chip>)}
      </div>
      <p className="text-[12px] text-muted mb-1">New sounds start with the current page, at {fmt(startMs)}.</p>
      {groups.map(([name, items]) => (
        <div key={name}>
          {!shelf && <p className="text-[12px] font-semibold text-muted mt-3 mb-1">{name}</p>}
          {items.map((s) => (
            <Row
              key={s.ref}
              play={<PlayButton id={s.ref} label={s.title} preview={preview} onPlay={() => preview.toggle(s.ref, (done) => previewBuffer(synthBuiltin(s.ref, audioContext().sampleRate), done))} />}
              title={s.title}
              meta={`${(s.lengthMs / 1000).toFixed(1)}s`}
              action={<AddButton label={`Add ${s.title}`} onClick={() => addTrack({ kind: 'sfx', name: s.title, preset: s.ref, start: startMs, volume: 0.9 })} />}
            />
          ))}
        </div>
      ))}
      {!list.length && !stock && <Empty title="No sounds by that name">Try a different word.</Empty>}
      {stock && <StockSounds q={q} preview={preview} startMs={startMs} />}
    </div>
  )
}

function StockSounds({ q, preview, startMs }: { q: string; preview: Preview; startMs: number }) {
  const [term, setTerm] = useState('')
  const [anyLicense, setAnyLicense] = useState(false)
  const [state, setState] = useState<{ loading: boolean; sounds: Sound[]; error?: string }>({ loading: false, sounds: [] })
  const search = async (text: string) => {
    if (!text.trim()) return
    setState({ loading: true, sounds: [] })
    try {
      const r = await api<{ sounds: Sound[] }>(`/api/stock/sounds?q=${encodeURIComponent(text)}${anyLicense ? '&any_license=true' : ''}`)
      setState({ loading: false, sounds: r.sounds })
    } catch (e) {
      setState({ loading: false, sounds: [], error: (e as Error).message })
    }
  }
  return (
    <div className="flex flex-col">
      <SectionLabel>More from Freesound</SectionLabel>
      <form className="flex gap-2" onSubmit={(e) => {
        e.preventDefault()
        void search(term || q)
      }}>
        <Input className="flex-1" placeholder={q || 'rain, door, crowd...'} value={term} onChange={(e) => setTerm(e.target.value)} />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      <div className="mt-2">
        <Toggle label="Include sounds that need credit" checked={anyLicense} onChange={setAnyLicense} />
      </div>
      {state.loading && <div className="py-6 flex justify-center"><Spinner /></div>}
      {state.error && <p className="text-[12px] text-danger mt-2">{state.error}</p>}
      <div className="mt-2">
        {state.sounds.map((s) => (
          <Row
            key={s.id}
            play={<PlayButton id={`fs:${s.id}`} label={s.name} preview={preview} onPlay={() => preview.toggle(`fs:${s.id}`, (done) => previewUrl(s.url, done))} />}
            title={s.name}
            meta={
              <>
                {licenseLabel(s.license)} · {s.duration.toFixed(1)}s · by{' '}
                <a href={s.link} target="_blank" rel="noreferrer" className="underline hover:text-accent">{s.author}<Icon name="external" size={10} className="inline ml-0.5 -mt-0.5" /></a>
              </>
            }
            action={<AddButton label={`Add ${s.name}`} onClick={() => addTrack({ kind: 'freesound', name: `${s.name} (${s.author})`, src: s.url, start: startMs, volume: 0.9 })} />}
          />
        ))}
      </div>
      <p className="text-[12px] text-muted mt-2 leading-relaxed">Results come from Freesound. CC0 sounds need no credit; for others, credit the author.</p>
    </div>
  )
}

// Your audio

type UploadItem = { src: string; name: string }

function YoursTab({ preview, startMs }: { preview: Preview; startMs: number }) {
  const guest = useEditor((s) => s.guest)
  const [items, setItems] = useState<UploadItem[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const load = async () => {
    try {
      if (guest) setItems((await listLocalBlobs('audio')).map((r) => ({ src: `local:${r.id}`, name: r.name })))
      else setItems((await api<{ assets: Array<{ filename: string; url: string }> }>('/api/assets?kind=audio')).assets.map((a) => ({ src: a.url, name: a.filename })))
    } catch {
      setItems([])
    }
  }
  useEffect(() => {
    void load()
  }, [guest])

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setBusy(true)
    setError('')
    for (const f of Array.from(files)) {
      if (!f.type.startsWith('audio/')) {
        setError(`${f.name} isn't an audio file`)
        continue
      }
      try {
        const src = await storeAudio(f)
        addTrack({ kind: 'upload', name: f.name.replace(/\.[^.]+$/, ''), src, start: startMs, volume: 0.9 })
      } catch (e) {
        setError((e as Error).message || 'Upload failed')
      }
    }
    setBusy(false)
    void load()
  }

  return (
    <div className="flex flex-col">
      <input ref={input} type="file" accept="audio/*" multiple hidden onChange={(e) => {
        void onFiles(e.target.files)
        e.target.value = ''
      }} />
      <Button variant="primary" className="w-full rounded-full" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Spinner className="border-white/40 border-t-white" /> : <Icon name="upload" size={16} />} Upload audio
      </Button>
      <p className="text-[12px] text-muted mt-2">MP3, WAV, M4A, OGG or WebM. New uploads start at the current page.</p>
      {error && <p className="text-[12px] text-danger mt-2">{error}</p>}
      <Recorder startMs={startMs} preview={preview} onSaved={load} />
      <SectionLabel>Your uploads</SectionLabel>
      {items === null ? (
        <div className="py-4 flex justify-center"><Spinner /></div>
      ) : items.length ? (
        items.map((u) => (
          <Row
            key={u.src}
            play={<PlayButton id={u.src} label={u.name} preview={preview} onPlay={() => preview.toggle(u.src, (done) => previewUrl(resolveLocal(u.src), done))} />}
            title={u.name}
            action={<AddButton label={`Add ${u.name}`} onClick={() => addTrack({ kind: 'upload', name: u.name.replace(/\.[^.]+$/, ''), src: u.src, start: startMs, volume: 0.9 })} />}
          />
        ))
      ) : (
        <p className="text-[12px] text-muted">Nothing here yet.</p>
      )}
    </div>
  )
}

function pickMime() {
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  return options.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? ''
}

function Recorder({ startMs, preview, onSaved }: { startMs: number; preview: Preview; onSaved: () => void }) {
  const [state, setState] = useState<'idle' | 'recording' | 'done' | 'saving'>('idle')
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; chunks: Blob[]; t0: number; timer: number } | null>(null)
  const [clip, setClip] = useState<{ blob: Blob; url: string; ms: number } | null>(null)

  useEffect(() => () => {
    const r = rec.current
    if (r) {
      clearInterval(r.timer)
      if (r.mr.state !== 'inactive') r.mr.stop()
      r.stream.getTracks().forEach((t) => t.stop())
    }
  }, [])
  useEffect(() => () => {
    if (clip) URL.revokeObjectURL(clip.url)
  }, [clip])

  const start = async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError("This browser can't record audio.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      const mime = pickMime()
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks: Blob[] = []
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const r = rec.current
        if (!r) return
        clearInterval(r.timer)
        const type = (mr.mimeType || mime || 'audio/webm').split(';')[0]
        const blob = new Blob(chunks, { type })
        setClip({ blob, url: URL.createObjectURL(blob), ms: Date.now() - r.t0 })
        setState('done')
        rec.current = null
      }
      const t0 = Date.now()
      const timer = window.setInterval(() => setElapsed(Date.now() - t0), 200)
      rec.current = { mr, stream, chunks, t0, timer }
      setElapsed(0)
      setClip(null)
      mr.start(250)
      setState('recording')
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in your browser to record.' : "Couldn't start the microphone.")
    }
  }

  const stop = () => rec.current?.mr.stop()

  const save = async () => {
    if (!clip) return
    setState('saving')
    const ext = clip.blob.type.includes('mp4') ? 'm4a' : clip.blob.type.includes('ogg') ? 'ogg' : 'webm'
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const file = new File([clip.blob], `Voiceover ${stamp}.${ext}`, { type: clip.blob.type })
    try {
      const src = await storeAudio(file)
      addTrack({ kind: 'voice', name: `Voiceover ${stamp}`, src, start: startMs, volume: 1 })
      setClip(null)
      setState('idle')
      onSaved()
    } catch (e) {
      setError((e as Error).message || "Couldn't save the recording")
      setState('done')
    }
  }

  return (
    <div className="mt-5 rounded-card border border-line bg-surface-2 p-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className={cx('h-9 w-9 rounded-full flex items-center justify-center', state === 'recording' ? 'bg-danger text-white animate-pulse' : 'bg-accent-wash text-accent')}>
          <Icon name="mic" size={17} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-ink">Voiceover</p>
          <p className="text-[12px] text-muted">
            {state === 'recording' ? `Recording ${fmt(elapsed)}` : clip ? `Take ready, ${fmt(clip.ms)}` : 'Record yourself over this page.'}
          </p>
        </div>
      </div>
      {state === 'recording' ? (
        <Button variant="danger" onClick={stop}><Icon name="stop" size={13} filled /> Stop recording</Button>
      ) : clip ? (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => preview.toggle('take', (done) => previewUrl(clip.url, done))}>
            {preview.playing === 'take' ? <Icon name="stop" size={12} filled /> : <Icon name="play" size={13} filled />} Listen
          </Button>
          <Button variant="ghost" size="sm" onClick={start}>Redo</Button>
          <div className="flex-1" />
          <Button variant="primary" size="sm" disabled={state === 'saving'} onClick={save}>Add to page</Button>
        </div>
      ) : (
        <Button variant="outline" onClick={start}><Icon name="mic" size={15} /> Start recording</Button>
      )}
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  )
}

// Tracks in the design

const KIND_LABEL: Record<AudioTrack['kind'], string> = {
  loop: 'Music', sfx: 'Effect', upload: 'Upload', voice: 'Voiceover', freesound: 'Freesound',
}

function NumInput({ label, value, onChange, step = 0.1, min = 0, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = Number(text)
    if (Number.isFinite(n)) onChange(Math.min(max ?? Infinity, Math.max(min, n)))
    else setText(String(value))
  }
  return (
    <label className="flex flex-col gap-1 text-[12px] text-ink-2">
      {label}
      <input
        type="number"
        value={text}
        step={step}
        min={min}
        max={max}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="h-8 rounded-lg border border-line-2 bg-surface px-2 text-[13px] tabular-nums"
      />
    </label>
  )
}

function TrackRow({ t, preview, totalMs }: { t: AudioTrack; preview: Preview; totalMs: number }) {
  const [open, setOpen] = useState(false)
  const [vol, setVol] = useState(t.volume)
  useEffect(() => setVol(t.volume), [t.volume])
  const s = (ms: number | undefined) => Math.round((ms ?? 0) / 100) / 10
  const end = t.duration ? t.start + t.duration : t.loop ? totalMs : null
  return (
    <div className="rounded-control border border-line bg-surface">
      <div className="flex items-center gap-2.5 p-2">
        <PlayButton id={`t:${t.id}`} label={t.name} preview={preview} onPlay={() => {
          const buf = trackBuffer(t, audioContext().sampleRate)
          preview.toggle(`t:${t.id}`, (done) => previewBuffer(buf, done, { offset: (t.offset ?? 0) / 1000, maxSeconds: 15, volume: t.volume }), buf)
        }} />
        <button className="flex-1 min-w-0 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <p className="text-[13px] text-ink truncate">{t.name}</p>
          <p className="text-[11px] text-muted truncate">
            {KIND_LABEL[t.kind]} · from {fmt(t.start)}{end !== null ? ` to ${fmt(end)}` : ''}{t.loop ? ' · loops' : ''}
          </p>
        </button>
        <GlyphButton label={open ? 'Hide settings' : 'Track settings'} size="sm" onClick={() => setOpen(!open)}>
          <Icon name="chevron-down" size={16} className={cx('transition', open && 'rotate-180')} />
        </GlyphButton>
      </div>
      {open && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-3 border-t border-line">
          <div className="pt-2">
            <Slider label="Volume" value={Math.round(vol * 100)} min={0} max={100} onChange={(v) => setVol(v / 100)} onCommit={() => vol !== t.volume && updateTrack(t.id, { volume: vol })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumInput label="Starts at (s)" value={s(t.start)} max={totalMs / 1000} onChange={(v) => updateTrack(t.id, { start: Math.round(v * 1000) })} />
            <NumInput label="Length (s, 0 = full)" value={s(t.duration)} onChange={(v) => updateTrack(t.id, { duration: v > 0 ? Math.round(v * 1000) : undefined })} />
            <NumInput label="Fade in (s)" value={s(t.fadeIn)} max={30} onChange={(v) => updateTrack(t.id, { fadeIn: Math.round(v * 1000) })} />
            <NumInput label="Fade out (s)" value={s(t.fadeOut)} max={30} onChange={(v) => updateTrack(t.id, { fadeOut: Math.round(v * 1000) })} />
            <NumInput label="Skip into clip (s)" value={s(t.offset)} onChange={(v) => updateTrack(t.id, { offset: Math.round(v * 1000) || undefined })} />
          </div>
          <Toggle label="Repeat until the end" checked={!!t.loop} onChange={(v) => updateTrack(t.id, { loop: v })} />
          <Button variant="danger" size="sm" onClick={() => {
            stopPreview()
            removeTrack(t.id)
          }}>
            <Icon name="trash" size={14} /> Remove from design
          </Button>
        </div>
      )}
    </div>
  )
}

export default function SoundPane() {
  const doc = useDoc()
  const page = usePage()
  const [tab, setTab] = useState<Tab>('music')
  const preview = usePreview()
  const tracks = tracksOf(doc)
  const startMs = pageStart(doc, page?.id)
  const totalMs = designDuration(doc)
  return (
    <div className="flex flex-col">
      {tracks.length > 0 && (
        <>
          <SectionLabel action={<span className="text-[12px] text-muted">{fmt(totalMs)} total</span>}>In this design</SectionLabel>
          <div className="flex flex-col gap-1.5 mb-4">
            {tracks.map((t) => <TrackRow key={t.id} t={t} preview={preview} totalMs={totalMs} />)}
          </div>
        </>
      )}
      <ChoiceRow<Tab>
        value={tab}
        onChange={setTab}
        options={[{ value: 'music', label: 'Music' }, { value: 'sfx', label: 'Sound effects' }, { value: 'yours', label: 'Your audio' }]}
        className="mb-3"
      />
      {tab === 'music' && <MusicTab preview={preview} />}
      {tab === 'sfx' && <SfxTab preview={preview} startMs={startMs} />}
      {tab === 'yours' && <YoursTab preview={preview} startMs={startMs} />}
    </div>
  )
}
