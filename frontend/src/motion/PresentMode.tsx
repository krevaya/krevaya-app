import { Icon } from '@/components/icons'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { playDesignAudio, prepareDesignAudio } from '@/audio/player'
import { cx, Spinner } from '@/components/ui/kit'
import type { DesignDoc } from '@/doc/schema'
import { preparePage } from '@/export/raster'
import { useEditor } from '@/stores/editor'
import { clock, openPresenterWindow, showChannel, type ToPresenter, type ToShow } from './channel'
import { ShowStage } from './show'
import { designDuration, pageRunTime, pageStarts } from './timeline'

const IDLE_MS = 2500

export function PresentMode() {
  const store = useEditor((s) => s.doc)
  const designId = useEditor((s) => s.designId) ?? 'local'
  const title = useEditor((s) => s.title)
  const root = useRef<HTMLDivElement>(null)
  const host = useRef<HTMLDivElement>(null)
  const show = useRef<ShowStage | null>(null)
  const chan = useRef<BroadcastChannel | null>(null)
  const audio = useRef<{ stop(): void } | null>(null)
  const nav = useRef(0)
  const advancing = useRef(false)
  const popupAt = useRef(0)
  const askedFullscreen = useRef(false)

  const docNow = useCallback((): DesignDoc => store?.getSnapshot() ?? { pages: [], settings: {} }, [store])
  const [index, setIndex] = useState(() => {
    const s = useEditor.getState()
    return Math.max(0, docNow().pages.findIndex((p) => p.id === s.pageId))
  })
  const [autoplay, setAutoplay] = useState(false)
  const [audioLoading, setAudioLoading] = useState(false)
  const [startedAt] = useState(() => Date.now())
  const [now, setNow] = useState(() => Date.now())
  const [idle, setIdle] = useState(false)
  const live = useRef({ index, autoplay })
  live.current = { index, autoplay }

  const count = docNow().pages.length
  const hasAudio = !!docNow().settings.audio?.length

  const stopAudio = () => {
    audio.current?.stop()
    audio.current = null
  }

  /** Render the mix ahead, so playback and the page can start on the same frame. */
  const prepareAudio = async () => {
    stopAudio()
    const doc = docNow()
    if (!doc.settings.audio?.length) return
    setAudioLoading(true)
    await prepareDesignAudio(doc, designDuration(doc)).catch((e) => console.warn('audio failed', e))
    setAudioLoading(false)
  }

  const playAudioFrom = (i: number) => {
    stopAudio()
    const doc = docNow()
    if (doc.settings.audio?.length) audio.current = playDesignAudio(doc, pageStarts(doc.pages)[i] ?? 0, designDuration(doc))
  }

  /** Go to page i. Forward moves play the page's transition. */
  const go = useCallback(async (i: number, opts: { transition?: boolean; keepAudio?: boolean } = {}) => {
    const doc = docNow()
    const page = doc.pages[i]
    if (!page || !show.current) return
    const token = ++nav.current
    const from = opts.transition ? doc.pages[live.current.index] ?? null : null
    await preparePage(page).catch(() => {})
    if (token !== nav.current || !show.current) return
    const auto = live.current.autoplay
    if (auto && !opts.keepAudio) {
      await prepareAudio()
      if (token !== nav.current || !show.current) return
      playAudioFrom(i)
    }
    show.current.show(page, auto ? pageRunTime(page) : Infinity, from)
    setIndex(i)
    advancing.current = false
  }, [docNow])

  const next = useCallback(() => {
    const { index: i } = live.current
    if (i < docNow().pages.length - 1) void go(i + 1, { transition: true })
  }, [docNow, go])
  const prev = useCallback(() => {
    const { index: i } = live.current
    if (i > 0) void go(i - 1)
  }, [go])

  const exit = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    useEditor.setState({ presenting: false })
  }, [])

  const toggleAutoplay = useCallback(async (on = !live.current.autoplay) => {
    live.current.autoplay = on
    setAutoplay(on)
    const i = live.current.index
    if (!on) {
      stopAudio()
      const page = docNow().pages[i]
      if (page) show.current?.restart(Infinity)
      return
    }
    // start the page over so the music and the page line up
    const token = ++nav.current
    await prepareAudio()
    if (token !== nav.current || !live.current.autoplay) return
    playAudioFrom(i)
    const page = docNow().pages[i]
    if (page) show.current?.restart(pageRunTime(page))
  }, [docNow])

  // stage
  useLayoutEffect(() => {
    const el = host.current!
    const s = new ShowStage(el)
    show.current = s
    const ro = new ResizeObserver(() => s.resize(el.clientWidth, el.clientHeight))
    ro.observe(el)
    s.onTick = (t) => {
      const { index: i, autoplay: auto } = live.current
      const page = docNow().pages[i]
      if (!auto || !page || advancing.current || t < pageRunTime(page)) return
      if (i < docNow().pages.length - 1) {
        advancing.current = true
        void go(i + 1, { transition: true, keepAudio: true })
      } else {
        advancing.current = true
        live.current.autoplay = false
        setAutoplay(false)
      }
    }
    void go(live.current.index)
    return () => {
      ro.disconnect()
      s.destroy()
      show.current = null
      stopAudio()
    }
  }, [])

  // warm the audio cache so autoplay starts quickly
  useEffect(() => {
    const doc = docNow()
    if (doc.settings.audio?.length) void prepareDesignAudio(doc, designDuration(doc)).catch(() => {})
  }, [docNow])

  // fullscreen
  useEffect(() => {
    let wasFull = false
    const onChange = () => {
      if (document.fullscreenElement) wasFull = true
      // opening the presenter window can knock the browser out of fullscreen; stay in the show then
      else if (wasFull && Date.now() - popupAt.current > 2000) exit()
    }
    document.addEventListener('fullscreenchange', onChange)
    // once per show: the click that started it is the only gesture we get
    if (!askedFullscreen.current) {
      askedFullscreen.current = true
      root.current?.requestFullscreen?.().catch(() => {})
    }
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [exit])

  // keys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key
      if (k === 'Escape') exit()
      else if (k === 'ArrowRight' || k === 'ArrowDown' || k === ' ' || k === 'PageDown' || k === 'Enter') next()
      else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') prev()
      else if (k === 'Home') void go(0)
      else if (k === 'End') void go(docNow().pages.length - 1)
      else if (k === 'a' || k === 'A') void toggleAutoplay()
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [docNow, exit, go, next, prev, toggleAutoplay])

  // timer + idle controls
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(id)
  }, [])
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const poke = () => {
    setIdle(false)
    clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS)
  }
  useEffect(() => {
    poke()
    return () => clearTimeout(idleTimer.current)
  }, [])

  // presenter window
  const post = useCallback((m: ToPresenter) => chan.current?.postMessage(m), [])
  const sendAll = useCallback(() => {
    post({ type: 'doc', doc: docNow() })
    post({ type: 'state', state: { index: live.current.index, autoplay: live.current.autoplay, startedAt, title } })
  }, [docNow, post, startedAt, title])
  useEffect(() => {
    const ch = showChannel(designId)
    chan.current = ch
    if (!ch) return
    ch.onmessage = (e: MessageEvent<ToShow>) => {
      const m = e.data
      if (m.type === 'hello') sendAll()
      else if (m.type === 'next') next()
      else if (m.type === 'prev') prev()
      else if (m.type === 'goto') void go(m.index, { transition: m.index === live.current.index + 1 })
      else if (m.type === 'autoplay') void toggleAutoplay(m.on)
      else if (m.type === 'exit') exit()
    }
    sendAll()
    return () => {
      ch.postMessage({ type: 'ended' } satisfies ToPresenter)
      ch.close()
      chan.current = null
    }
  }, [designId, exit, go, next, prev, sendAll, toggleAutoplay])
  useEffect(() => {
    post({ type: 'state', state: { index, autoplay, startedAt, title } })
  }, [index, autoplay, startedAt, title, post])
  useEffect(() => {
    const off = store?.subscribe(() => post({ type: 'doc', doc: docNow() }))
    return () => {
      off?.()
    }
  }, [store, docNow, post])

  const ctl = (label: string, onClick: () => void, icon: ReactNode, active?: boolean) => (
    <button
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={cx('h-9 min-w-9 px-2 rounded-full flex items-center justify-center gap-1.5 text-[13px] transition', active ? 'bg-white text-black' : 'text-white hover:bg-white/15')}
    >
      {icon}
    </button>
  )

  return (
    <div
      ref={root}
      className={cx('fixed inset-0 z-50 bg-black select-none', idle && 'cursor-none')}
      onPointerMove={poke}
      role="dialog"
      aria-label="Presentation"
    >
      <div ref={host} className="absolute inset-0" onClick={next} />
      <div
        className={cx(
          'absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/70 backdrop-blur px-2 py-1.5 border border-white/10 transition-opacity duration-300',
          idle ? 'opacity-0 pointer-events-none' : 'opacity-100',
        )}
        onPointerMove={(e) => {
          e.stopPropagation()
          setIdle(false)
          clearTimeout(idleTimer.current)
        }}
      >
        {ctl('Previous page', prev, <Icon name="chevron-left" size={18} />)}
        <span className="text-white/85 text-[13px] tabular-nums px-1.5">{index + 1} / {count}</span>
        {ctl('Next page', next, <Icon name="chevron-right" size={18} />)}
        <span className="w-px h-5 bg-white/20 mx-1" />
        {ctl(
          autoplay ? 'Stop autoplay' : 'Autoplay',
          () => void toggleAutoplay(),
          <>{audioLoading ? <Spinner className="h-3.5 w-3.5" /> : autoplay ? <Icon name="pause" size={15} /> : <Icon name="play" size={15} />}<span className="pr-1">Autoplay</span></>,
          autoplay,
        )}
        <span className="text-white/70 text-[13px] tabular-nums px-2" title="Time presenting">{clock(now - startedAt)}</span>
        {ctl('Open presenter view', () => {
          popupAt.current = Date.now()
          openPresenterWindow(designId)
        }, <Icon name="panes" size={16} />)}
        {ctl('Exit (Esc)', exit, <Icon name="x" size={17} />)}
      </div>
      {hasAudio && !autoplay && !idle && (
        <p className="absolute top-4 left-1/2 -translate-x-1/2 text-white/60 text-[12px]">Audio plays on autoplay</p>
      )}
    </div>
  )
}
