import { Icon } from '@/components/icons'
import { useEffect, useRef, useState } from 'react'
import { Button, Spinner } from '@/components/ui/kit'
import type { DesignDoc, Page } from '@/doc/schema'
import { ensureFontCatalog } from '@/editor/fonts'
import { renderThumbnail } from '@/export/raster'
import { clock, showChannel, type ShowState, type ToPresenter, type ToShow } from '@/motion/channel'

// The speaker's window: opened from present mode, kept in sync over a BroadcastChannel.

function Slide({ page, label, big }: { page: Page | undefined; label: string; big?: boolean }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    let live = true
    setSrc('')
    if (page) renderThumbnail(page, big ? 1400 : 700).then((s) => live && setSrc(s)).catch(() => {})
    return () => {
      live = false
    }
  }, [page, big])
  return (
    <figure className="flex flex-col gap-2 min-h-0">
      <figcaption className="text-[12px] font-medium text-muted uppercase tracking-wide">{label}</figcaption>
      <div
        className="rounded-card border border-line bg-canvas overflow-hidden flex items-center justify-center min-h-0"
        style={{ aspectRatio: page ? `${page.width} / ${page.height}` : '16 / 9' }}
      >
        {!page ? (
          <span className="text-[13px] text-muted">That's the last page</span>
        ) : src ? (
          <img src={src} alt="" className="h-full w-full object-contain" />
        ) : (
          <Spinner />
        )}
      </div>
    </figure>
  )
}

export default function SpeakerWindow({ id }: { id: string }) {
  const [doc, setDoc] = useState<DesignDoc | null>(null)
  const [state, setState] = useState<ShowState | null>(null)
  const [ended, setEnded] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [pageSince, setPageSince] = useState(() => Date.now())
  const chan = useRef<BroadcastChannel | null>(null)
  const lastIndex = useRef(-1)
  const send = (m: ToShow) => chan.current?.postMessage(m)

  useEffect(() => {
    void ensureFontCatalog()
    const ch = showChannel(id)
    chan.current = ch
    if (!ch) return
    ch.onmessage = (e: MessageEvent<ToPresenter>) => {
      const m = e.data
      if (m.type === 'doc') setDoc(m.doc)
      else if (m.type === 'state') {
        setEnded(false)
        if (lastIndex.current !== m.state.index) setPageSince(Date.now())
        lastIndex.current = m.state.index
        setState(m.state)
      } else if (m.type === 'ended') setEnded(true)
    }
    ch.postMessage({ type: 'hello' } satisfies ToShow)
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => {
      clearInterval(t)
      ch.close()
    }
  }, [id])

  useEffect(() => {
    document.title = state ? `Presenter view · ${state.title} · Krevaya` : 'Presenter view · Krevaya'
  }, [state])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') send({ type: 'next' })
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') send({ type: 'prev' })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!doc || !state || ended) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6 bg-surface text-ink">
        {ended ? (
          <>
            <p className="text-lg font-semibold">That's the end of the show</p>
            <p className="text-muted text-[14px]">Present again from the editor and this window follows along.</p>
            <Button variant="outline" onClick={() => window.close()}>Close this window</Button>
          </>
        ) : (
          <>
            <Spinner />
            <p className="text-muted text-[14px] max-w-sm">Waiting for the presentation. Open this from present mode in the editor.</p>
          </>
        )}
      </div>
    )
  }

  const page = doc.pages[state.index]
  const nextPage = doc.pages[state.index + 1]
  const last = state.index >= doc.pages.length - 1

  return (
    <div className="h-full flex flex-col bg-surface text-ink">
      <header className="h-14 shrink-0 border-b border-line px-4 flex items-center gap-3">
        <h1 className="font-display text-[17px] font-semibold truncate">{state.title}</h1>
        <span className="text-[13px] text-muted tabular-nums">Page {state.index + 1} of {doc.pages.length}</span>
        <div className="flex-1" />
        <div className="flex items-baseline gap-2 tabular-nums">
          <span className="text-[12px] text-muted">Elapsed</span>
          <span className="text-[22px] font-semibold">{clock(now - state.startedAt)}</span>
          <span className="text-[12px] text-muted ml-3">On this page</span>
          <span className="text-[15px] font-medium">{clock(now - pageSince)}</span>
        </div>
      </header>
      <main className="flex-1 min-h-0 grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-5 p-5">
        <div className="flex flex-col gap-4 min-h-0">
          <Slide page={page} label="Now showing" big />
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => send({ type: 'prev' })} disabled={state.index === 0}>
              <Icon name="chevron-left" size={16} /> Previous
            </Button>
            <Button variant="primary" onClick={() => send({ type: 'next' })} disabled={last}>
              Next <Icon name="chevron-right" size={16} />
            </Button>
            <Button variant={state.autoplay ? 'soft' : 'outline'} onClick={() => send({ type: 'autoplay', on: !state.autoplay })}>
              {state.autoplay ? <Icon name="pause" size={15} /> : <Icon name="play" size={15} />} Autoplay
            </Button>
            <div className="flex-1" />
            <Button variant="danger" onClick={() => send({ type: 'exit' })}>
              <Icon name="x" size={15} /> End show
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-4 min-h-0">
          <Slide page={nextPage} label="Up next" />
          <section className="flex-1 min-h-0 flex flex-col gap-2">
            <h2 className="text-[12px] font-medium text-muted uppercase tracking-wide">Notes</h2>
            <div className="flex-1 min-h-0 overflow-y-auto scroll-thin rounded-card border border-line p-4 text-[17px] leading-relaxed whitespace-pre-wrap">
              {page?.notes?.trim() || <span className="text-muted text-[14px]">No notes for this page. Add them from Notes in the editor.</span>}
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
