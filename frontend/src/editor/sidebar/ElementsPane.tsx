import { Icon } from '@/components/icons'
import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { featuredEmoji, featuredIcons } from 'virtual:iconify/featured'
import { Button, Chip, cx, Empty, Input, SectionLabel, Spinner } from '@/components/ui/kit'
import { iconLabel, iconNow, iconSvg, loadIcon, loadIconIndex, searchSets, type IconBody, type IconHit, type IconIndex } from '@/content/elements/icons'
import { builtIn, loadLibrary, matches, type LibraryEntry, type LibraryKind } from '@/content/elements/library'
import { qrSvg, QR_DEFAULTS, type QrOptions } from '@/content/elements/qr'
import { newImage, newLine, newShape, newSvg, NEW_SHAPE_TINT } from '@/doc/factory'
import type { LineHead } from '@/doc/schema'
import { QrForm } from '@/features/elements/QrForm'
import { loadImage, svgDataUrl } from '@/render/assets'
import { SHAPES } from '@/render/shapes'
import { useBrand } from '@/stores/brand'
import { addElement, currentPage } from '../actions'
import { ShapeIcon } from '../SelectionBar'

const LINES: Array<{ label: string; start: LineHead; end: LineHead; dash?: 'dashed' | 'dotted' }> = [
  { label: 'Line', start: 'none', end: 'none' },
  { label: 'Dashed line', start: 'none', end: 'none', dash: 'dashed' },
  { label: 'Dotted line', start: 'none', end: 'none', dash: 'dotted' },
  { label: 'Arrow', start: 'none', end: 'arrow' },
  { label: 'Double arrow', start: 'arrow', end: 'arrow' },
  { label: 'Pointer', start: 'none', end: 'triangle' },
  { label: 'Dot to dot', start: 'circle', end: 'circle' },
  { label: 'Bar ends', start: 'bar', end: 'bar' },
]

function LinePreview({ start, end, dash }: { start: LineHead; end: LineHead; dash?: string }) {
  const d = dash === 'dashed' ? '6 4' : dash === 'dotted' ? '0.1 5' : undefined
  const head = (kind: LineHead, x: number, dir: number) => {
    if (kind === 'arrow') return <path d={`M${x - dir * 7} -5 L${x} 0 L${x - dir * 7} 5`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    if (kind === 'triangle') return <path d={`M${x - dir * 9} -5 L${x} 0 L${x - dir * 9} 5 Z`} fill="currentColor" />
    if (kind === 'circle') return <circle cx={x - dir * 3} cy={0} r={4} fill="currentColor" />
    if (kind === 'bar') return <path d={`M${x} -6 V6`} stroke="currentColor" strokeWidth="2" />
    return null
  }
  return (
    <svg viewBox="0 -10 80 20" className="w-full h-5 text-ink" aria-hidden>
      <line x1="4" y1="0" x2="76" y2="0" stroke="currentColor" strokeWidth="2" strokeDasharray={d} strokeLinecap="round" />
      {head(start, 4, -1)}
      {head(end, 76, 1)}
    </svg>
  )
}

// Adding things

function iconColor() {
  return useBrand.getState().active?.colors[0] ?? '#16131f'
}

function addIcon(body: IconBody, name: string) {
  const page = currentPage()
  if (page) addElement(newSvg(page, 'icon', iconSvg(body), { colors: { currentColor: iconColor() }, name: iconLabel(name) }))
}

function addEmoji(body: IconBody, name: string) {
  const page = currentPage()
  if (page) addElement(newSvg(page, 'emoji', iconSvg(body), { name: iconLabel(name) }))
}

async function addLibrary(kind: LibraryKind, item: LibraryEntry) {
  const page = currentPage()
  if (!page) return
  let markup = item.svg
  if (!markup && item.url) {
    try {
      const res = await fetch(item.url)
      const text = res.ok ? await res.text() : ''
      if (text.includes('<svg')) markup = text
    } catch {
      // not fetchable as text; fall back to a plain image below
    }
    if (!markup) {
      const img = await loadImage(item.url).catch(() => null)
      if (img) addElement(newImage(page, item.url, img.naturalWidth, img.naturalHeight, { name: item.name }))
      return
    }
  }
  if (markup) addElement(newSvg(page, kind, markup, { name: item.name }))
}

function addQr(o: QrOptions) {
  const page = currentPage()
  if (page && o.value.trim()) addElement(newSvg(page, 'qr', qrSvg(o), { qr: o, name: 'QR code' }))
}

// Tiles

const tileCls = 'rounded-tile bg-surface-2 border border-line hover:border-accent-line flex items-center justify-center transition'

function IconGlyph({ body }: { body: IconBody }) {
  return <span className="text-ink [&>svg]:w-7 [&>svg]:h-7 pointer-events-none" dangerouslySetInnerHTML={{ __html: iconSvg(body) }} />
}

function EmojiGlyph({ body }: { body: IconBody }) {
  return <img src={svgDataUrl(iconSvg(body))} alt="" className="w-9 h-9 pointer-events-none" draggable={false} loading="lazy" />
}

function useIconBody(hit: IconHit) {
  const [body, setBody] = useState(() => iconNow(hit))
  useEffect(() => {
    if (body) return
    let live = true
    loadIcon(hit).then((b) => live && setBody(b)).catch(() => {})
    return () => {
      live = false
    }
    // tiles are keyed by icon, so the hit never changes for one tile
  }, [])
  return body
}

function HitTile({ hit, emoji }: { hit: IconHit; emoji?: boolean }) {
  const body = useIconBody(hit)
  const name = hit.set.list[hit.i]
  return (
    <button
      title={iconLabel(name)}
      aria-label={iconLabel(name)}
      disabled={!body}
      onClick={() => body && (emoji ? addEmoji(body, name) : addIcon(body, name))}
      className={cx(tileCls, 'w-full h-full')}
    >
      {body ? emoji ? <EmojiGlyph body={body} /> : <IconGlyph body={body} /> : <span className="w-6 h-6 rounded-md bg-line/60" />}
    </button>
  )
}

function LibraryTile({ kind, item }: { kind: LibraryKind; item: LibraryEntry }) {
  const src = useMemo(() => (item.svg ? svgDataUrl(item.svg) : item.url ?? ''), [item])
  return (
    <button title={item.name} aria-label={item.name} onClick={() => void addLibrary(kind, item)} className={cx(tileCls, 'aspect-square p-2.5')}>
      <img src={src} alt="" className="max-w-full max-h-full object-contain pointer-events-none" draggable={false} loading="lazy" />
    </button>
  )
}

// A grid that only renders the rows in view, so thousands of icons stay quick.

function scrollParent(el: HTMLElement): HTMLElement {
  let p = el.parentElement
  while (p) {
    const oy = getComputedStyle(p).overflowY
    if (oy === 'auto' || oy === 'scroll') return p
    p = p.parentElement
  }
  return document.documentElement
}

function VirtualGrid<T>({ items, cols, rowHeight, gap = 8, render, itemKey }: {
  items: T[]
  cols: number
  rowHeight: number
  gap?: number
  render: (item: T) => ReactNode
  itemKey: (item: T) => string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [range, setRange] = useState<[number, number]>([0, 10])
  const stride = rowHeight + gap
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const scroller = scrollParent(el)
    const update = () => {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top
      const first = Math.max(0, Math.floor(-top / stride) - 3)
      const last = Math.ceil((scroller.clientHeight - top) / stride) + 3
      setRange((r) => (r[0] === first && r[1] === last ? r : [first, last]))
    }
    update()
    scroller.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [stride, items])
  const rows = Math.ceil(items.length / cols)
  const [first, last] = range
  return (
    <div ref={ref} style={{ height: Math.max(0, rows * stride - gap), position: 'relative' }}>
      <div
        style={{ position: 'absolute', left: 0, right: 0, top: first * stride, display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: rowHeight, gap }}
      >
        {items.slice(first * cols, Math.min(rows, last) * cols).map((it) => (
          <div key={itemKey(it)} style={{ height: rowHeight }}>{render(it)}</div>
        ))}
      </div>
    </div>
  )
}

// Data hooks

function useIconIndex(enabled: boolean) {
  const [index, setIndex] = useState<IconIndex | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!enabled || index) return
    let live = true
    loadIconIndex().then((i) => live && setIndex(i)).catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [enabled, index])
  return { index, failed }
}

function useLibrary(kind: LibraryKind) {
  const [items, setItems] = useState<LibraryEntry[]>(() => builtIn(kind))
  useEffect(() => {
    let live = true
    void loadLibrary(kind).then((all) => live && setItems(all))
    return () => {
      live = false
    }
  }, [kind])
  return items
}

const hitKey = (h: IconHit) => `${h.set.prefix}:${h.i}`

// Full "See all" views

type Category = 'icons' | 'emoji' | 'illustration' | 'sticker'

const TITLES: Record<Category, string> = { icons: 'Icons', emoji: 'Emoji', illustration: 'Illustrations', sticker: 'Stickers' }

function FullView({ kind, query, onBack }: { kind: Category; query: string; onBack: () => void }) {
  const [q, setQ] = useState(query)
  const [filter, setFilter] = useState<string>('all')
  const deferred = useDeferredValue(q)
  const isIcons = kind === 'icons' || kind === 'emoji'
  const { index, failed } = useIconIndex(isIcons)
  const library = useLibrary(kind === 'sticker' ? 'sticker' : 'illustration')

  const hits = useMemo(() => {
    if (!index) return []
    if (kind === 'icons') return searchSets(filter === 'all' ? index.sets : index.sets.filter((s) => s.prefix === filter), deferred)
    const all = searchSets([index.emoji], deferred)
    if (filter === 'all') return all
    const cat = index.categories.find((c) => c.name === filter)
    const allowed = new Set(cat?.items ?? [])
    return all.filter((h) => allowed.has(h.i))
  }, [index, kind, filter, deferred])

  // jump back to the top when the results change
  const top = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = top.current
    if (el) scrollParent(el).scrollTop = 0
  }, [deferred, filter])

  const needle = deferred.trim().toLowerCase()
  const libItems = isIcons ? [] : library.filter((i) => matches(i, needle))
  const chips = kind === 'icons'
    ? [{ id: 'all', label: 'All' }, ...(index?.sets ?? []).map((s) => ({ id: s.prefix, label: s.name }))]
    : kind === 'emoji'
      ? [{ id: 'all', label: 'All' }, ...(index?.categories ?? []).map((c) => ({ id: c.name, label: c.name }))]
      : []

  return (
    <div className="flex flex-col" ref={top}>
      <div className="sticky top-0 z-10 bg-surface pb-3 -mx-4 px-4 flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <button onClick={onBack} aria-label="Back to all elements" className="h-8 w-8 -ml-1 rounded-lg text-ink-2 hover:bg-hover flex items-center justify-center">
            <Icon name="arrow-left" size={17} />
          </button>
          <h3 className="text-[14px] font-semibold text-ink">{TITLES[kind]}</h3>
          {isIcons && index && <span className="ml-auto text-[12px] text-muted tabular-nums">{hits.length.toLocaleString()}</span>}
        </div>
        <Input autoFocus icon={<Icon name="search" size={16} />} placeholder={`Search ${TITLES[kind].toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} />
        {chips.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto scroll-thin pb-1 -mb-1">
            {chips.map((c) => (
              <Chip key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)} className="shrink-0 h-7 text-[12px]">{c.label}</Chip>
            ))}
          </div>
        )}
      </div>
      {isIcons && !index && !failed && <div className="py-10 flex justify-center"><Spinner /></div>}
      {isIcons && failed && <Empty title="Couldn't load icons">Check your connection and try again.</Empty>}
      {isIcons && index && hits.length === 0 && <Empty title="Nothing found">Try a different word, like "arrow" or "heart".</Empty>}
      {isIcons && index && hits.length > 0 && (
        <VirtualGrid
          items={hits}
          cols={5}
          rowHeight={52}
          itemKey={hitKey}
          render={(h) => <HitTile hit={h} emoji={kind === 'emoji'} />}
        />
      )}
      {!isIcons && (libItems.length ? (
        <div className="grid grid-cols-3 gap-2">
          {libItems.map((i) => <LibraryTile key={i.id} kind={kind as LibraryKind} item={i} />)}
        </div>
      ) : <Empty title="Nothing found">Try a different word.</Empty>)}
      {kind === 'icons' && <p className="text-[11px] text-faint mt-4">Icons from Tabler, Phosphor, Material Design, Remix, Carbon and Lucide, under their open licenses.</p>}
      {kind === 'emoji' && <p className="text-[11px] text-faint mt-4">Fluent Emoji by Microsoft, MIT license.</p>}
    </div>
  )
}

// Main view

function SeeAll({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} className="text-[12px] font-medium text-accent hover:underline">See all</button>
}

function QrBlock() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<QrOptions>(QR_DEFAULTS)
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="h-12 px-3 rounded-tile border border-line hover:border-accent-line flex items-center gap-3 text-[13px] text-ink-2">
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-ink" aria-hidden><path fill="currentColor" d="M3 3h8v8H3zm2 2v4h4V5zm8-2h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zm11-2h2v2h-2zm-3 0h2v4h-2zm3 3h2v2h-2zm2 2h3v3h-2v-1h-1zm-5 1h4v2h-4zm6-6h2v4h-2z" /></svg>
        Make a QR code for a link
      </button>
    )
  }
  return (
    <div className="flex flex-col gap-3 p-3.5 rounded-control border border-line">
      <QrForm value={value} onChange={setValue} />
      <Button variant="primary" onClick={() => addQr(value)} disabled={!value.value.trim() || value.value.trim() === 'https://'}>Add QR code</Button>
    </div>
  )
}

export default function ElementsPane() {
  const [q, setQ] = useState('')
  const [view, setView] = useState<Category | null>(null)
  const brandColor = useBrand((s) => s.active?.colors[0])
  const needle = useDeferredValue(q.trim().toLowerCase())
  const { index } = useIconIndex(!!needle)
  const illustrations = useLibrary('illustration')
  const stickers = useLibrary('sticker')

  if (view) return <FullView kind={view} query={q} onBack={() => setView(null)} />

  const shapes = SHAPES.filter((s) => !needle || s.label.toLowerCase().includes(needle))
  const lines = LINES.filter((l) => !needle || l.label.toLowerCase().includes(needle) || 'line arrow'.includes(needle))
  const iconHits = needle && index ? searchSets(index.sets, needle).slice(0, 8) : []
  const emojiHits = needle && index ? searchSets([index.emoji], needle).slice(0, 8) : []
  const ills = illustrations.filter((i) => matches(i, needle)).slice(0, 6)
  const stks = stickers.filter((i) => matches(i, needle)).slice(0, 8)
  const page = currentPage

  return (
    <div className="flex flex-col">
      <Input icon={<Icon name="search" size={16} />} placeholder="Search elements" value={q} onChange={(e) => setQ(e.target.value)} />
      {lines.length > 0 && (
        <>
          <SectionLabel>Lines and arrows</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            {lines.map((l) => (
              <button
                key={l.label}
                title={l.label}
                onClick={() => {
                  const p = page()
                  if (p) addElement(newLine(p, { startHead: l.start, endHead: l.end, dash: l.dash }))
                }}
                className="h-12 px-3 rounded-tile border border-line hover:bg-hover flex items-center"
              >
                <LinePreview start={l.start} end={l.end} dash={l.dash} />
              </button>
            ))}
          </div>
        </>
      )}
      {shapes.length > 0 && (
        <>
          <SectionLabel>Shapes</SectionLabel>
          <div className="grid grid-cols-4 gap-2">
            {shapes.map((s) => (
              <button
                key={s.kind}
                title={s.label}
                onClick={() => {
                  const p = page()
                  if (p) addElement(newShape(p, s.kind, brandColor ?? NEW_SHAPE_TINT))
                }}
                className="aspect-square rounded-tile bg-surface-2 border border-line hover:border-accent-line flex items-center justify-center"
              >
                <ShapeIcon kind={s.kind} size={38} color={brandColor ?? NEW_SHAPE_TINT} />
              </button>
            ))}
          </div>
        </>
      )}

      {(!needle || iconHits.length > 0) && (
        <>
          <SectionLabel action={<SeeAll onClick={() => setView('icons')} />}>Icons</SectionLabel>
          <div className="grid grid-cols-4 gap-2">
            {needle
              ? iconHits.map((h) => <div key={hitKey(h)} className="aspect-square"><HitTile hit={h} /></div>)
              : featuredIcons.slice(0, 8).map((ic) => (
                <button key={ic.prefix + ic.name} title={iconLabel(ic.name)} aria-label={iconLabel(ic.name)} onClick={() => addIcon(ic, ic.name)} className={cx(tileCls, 'aspect-square')}>
                  <IconGlyph body={ic} />
                </button>
              ))}
          </div>
        </>
      )}

      {(!needle || emojiHits.length > 0) && (
        <>
          <SectionLabel action={<SeeAll onClick={() => setView('emoji')} />}>Emoji</SectionLabel>
          <div className="grid grid-cols-4 gap-2">
            {needle
              ? emojiHits.map((h) => <div key={hitKey(h)} className="aspect-square"><HitTile hit={h} emoji /></div>)
              : featuredEmoji.slice(0, 8).map((ic) => (
                <button key={ic.name} title={iconLabel(ic.name)} aria-label={iconLabel(ic.name)} onClick={() => addEmoji(ic, ic.name)} className={cx(tileCls, 'aspect-square')}>
                  <EmojiGlyph body={ic} />
                </button>
              ))}
          </div>
        </>
      )}

      {ills.length > 0 && (
        <>
          <SectionLabel action={<SeeAll onClick={() => setView('illustration')} />}>Illustrations</SectionLabel>
          <div className="grid grid-cols-3 gap-2">
            {ills.map((i) => <LibraryTile key={i.id} kind="illustration" item={i} />)}
          </div>
        </>
      )}

      {stks.length > 0 && (
        <>
          <SectionLabel action={<SeeAll onClick={() => setView('sticker')} />}>Stickers</SectionLabel>
          <div className="grid grid-cols-4 gap-2">
            {stks.map((i) => <LibraryTile key={i.id} kind="sticker" item={i} />)}
          </div>
        </>
      )}

      {(!needle || 'qr code link'.includes(needle)) && (
        <>
          <SectionLabel>QR code</SectionLabel>
          <QrBlock />
        </>
      )}
    </div>
  )
}
