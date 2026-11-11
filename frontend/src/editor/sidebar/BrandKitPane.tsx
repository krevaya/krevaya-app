import { Icon } from '@/components/icons'
import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { Button, cx, Empty, SectionLabel } from '@/components/ui/kit'
import { newImage, newText, type TypeStyle } from '@/doc/factory'
import type { DesignElement, TextElement } from '@/doc/schema'
import { ensureFont, svgColors } from '@/render/assets'
import { useAuth } from '@/stores/auth'
import { useBrand, type BrandKit } from '@/stores/brand'
import { useEditor } from '@/stores/editor'
import { addElement, currentPage, selected, updateElements } from '../actions'
import { usePage, useSelected } from '../hooks'

const FALLBACK: Record<TypeStyle, string> = { heading: 'Outfit', subheading: 'Inter', body: 'Inter' }

function applyColor(color: string) {
  const els = selected().filter((e) => !e.locked)
  if (!els.length) {
    const page = currentPage()
    if (page) useEditor.getState().doc?.updatePage(page.id, { background: { type: 'solid', color } })
    return
  }
  const patches: Array<[string, Partial<DesignElement>]> = []
  for (const el of els) {
    if (el.type === 'text') patches.push([el.id, { color, gradient: undefined }])
    else if (el.type === 'shape') patches.push([el.id, { fill: { type: 'solid', color } }])
    else if (el.type === 'line') patches.push([el.id, { stroke: color }])
    else if (el.type === 'svg') {
      // only single-color artwork; recoloring an illustration to one flat color ruins it
      const found = svgColors(el.svg)
      if (el.kind === 'icon' || found.length === 1) patches.push([el.id, { colors: Object.fromEntries((found.length ? found : ['currentColor']).map((c) => [c, color])) }])
    } else if (el.type === 'image' && el.stroke) patches.push([el.id, { stroke: color }])
  }
  useEditor.getState().doc?.breakUndo()
  updateElements(patches)
}

/** The solid colors a design uses, most used first, for a first brand kit. */
function designColors(): string[] {
  const count = new Map<string, number>()
  const add = (c?: string) => {
    if (!c || !/^#[0-9a-f]{6}$/i.test(c)) return
    const k = c.toLowerCase()
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  for (const p of useEditor.getState().doc?.getSnapshot().pages ?? []) {
    if (p.background.type === 'solid') add(p.background.color)
    for (const el of p.elements) {
      if (el.type === 'text') add(el.color)
      else if (el.type === 'shape' && el.fill.type === 'solid') add(el.fill.color)
      else if (el.type === 'line') add(el.stroke)
    }
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 8)
}

/** Heading, subheading and body fonts as this design uses them. */
function designFonts(): BrandKit['fonts'] {
  const texts = (useEditor.getState().doc?.getSnapshot().pages ?? []).flatMap((p) => p.elements.filter((e): e is TextElement => e.type === 'text'))
  if (!texts.length) return {}
  const biggest = Math.max(...texts.map((t) => t.fontSize))
  const fonts: BrandKit['fonts'] = {}
  for (const role of ['heading', 'subheading', 'body'] as const) {
    const tally = new Map<string, number>()
    for (const t of texts) if (roleOf(t, biggest) === role) tally.set(t.fontFamily, (tally.get(t.fontFamily) ?? 0) + t.text.length)
    const top = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
    if (top) fonts[role] = top[0]
  }
  return fonts
}

function addText(kit: BrandKit, preset: TypeStyle) {
  const page = currentPage()
  if (page) addElement(newText(page, preset, { fontFamily: kit.fonts[preset] ?? FALLBACK[preset] }))
}

function addLogo(logo: BrandKit['logos'][number]) {
  const page = currentPage()
  if (page) addElement(newImage(page, logo.url, logo.width || 512, logo.height || 512, { name: logo.name || 'Logo' }))
}

/** Text without a role gets one from its size: biggest is the heading, close to it a subheading, the rest body. */
function roleOf(el: TextElement, biggest: number): TypeStyle {
  if (el.role) return el.role
  if (el.fontSize >= biggest * 0.95) return 'heading'
  if (el.fontSize >= biggest * 0.55) return 'subheading'
  return 'body'
}

function applyFonts(kit: BrandKit) {
  const page = currentPage()
  if (!page) return 0
  const texts = page.elements.filter((e): e is TextElement => e.type === 'text' && !e.locked)
  const biggest = Math.max(0, ...texts.map((t) => t.fontSize))
  const patches: Array<[string, Partial<DesignElement>]> = []
  for (const t of texts) {
    const family = kit.fonts[roleOf(t, biggest)]
    if (family && family !== t.fontFamily) patches.push([t.id, { fontFamily: family }])
  }
  useEditor.getState().doc?.breakUndo()
  updateElements(patches)
  return patches.length
}

export default function BrandKitPane() {
  const user = useAuth((s) => s.user)
  const guest = useEditor((s) => s.guest)
  const kits = useBrand((s) => s.kits)
  const kit = useBrand((s) => s.active)
  const loaded = useBrand((s) => s.loaded)
  const sel = useSelected()
  const page = usePage()

  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  useEffect(() => {
    if (user && !loaded) void useBrand.getState().load()
  }, [user, loaded])
  // the kit is edited on the Brand page in another tab; pick up changes when coming back
  useEffect(() => {
    if (!user) return
    const again = () => void useBrand.getState().load()
    window.addEventListener('focus', again)
    return () => window.removeEventListener('focus', again)
  }, [user])
  useEffect(() => setNote(''), [kit?.id, page?.id])
  useEffect(() => {
    if (!kit) return
    for (const p of ['heading', 'subheading', 'body'] as const) if (kit.fonts[p]) void ensureFont(kit.fonts[p]!, p === 'body' ? 400 : 700)
  }, [kit])

  if (!user || guest) {
    return (
      <Empty title="Brand kits live in your account">
        Keep a set of colors, fonts and logos for each brand you work on, ready in the editor whenever you need them.{' '}
        <Link href={`/login?next=${encodeURIComponent(location.pathname)}`} className="text-accent hover:underline">Sign in</Link> or{' '}
        <Link href="/signup" className="text-accent hover:underline">create a free account</Link>.
      </Empty>
    )
  }
  if (loaded && !kit) {
    const start = async () => {
      setCreating(true)
      try {
        await useBrand.getState().save({ name: 'My brand', colors: designColors(), fonts: designFonts() })
      } catch (e) {
        setNote((e as Error).message)
      }
      setCreating(false)
    }
    return (
      <Empty title="No brand kit yet">
        <span className="block">Set up your brand once: its palette, type and logos sit right here whenever you design.</span>
        <Button variant="primary" size="sm" className="mt-3" disabled={creating} onClick={() => void start()}>
          {creating ? 'Creating…' : 'Start a kit from this design'}
        </Button>
        <span className="block mt-2 text-[12px]">It picks up the colors and fonts used here. Add logos on the <a href="/brand" target="_blank" rel="noreferrer" className="text-accent hover:underline">Brand page</a>.</span>
        {note && <span className="block mt-2 text-danger">{note}</span>}
      </Empty>
    )
  }
  if (!kit) return null

  const target = sel.length ? (sel.length === 1 ? 'the selection' : `${sel.length} elements`) : 'the page background'

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        {kits.length > 1 ? (
          <select
            value={kit.id}
            onChange={(e) => useBrand.getState().setActive(e.target.value)}
            className="flex-1 h-9 rounded-control border border-line-2 bg-surface px-2.5 text-[13px] font-medium"
            aria-label="Brand kit"
          >
            {kits.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
        ) : (
          <p className="flex-1 text-[14px] font-semibold text-ink truncate">{kit.name}</p>
        )}
        <a href="/brand" target="_blank" rel="noreferrer" className="h-9 px-2.5 rounded-control text-[13px] text-muted hover:bg-hover hover:text-ink flex items-center gap-1.5">
          Edit <Icon name="external" size={13} />
        </a>
      </div>

      <SectionLabel>Colors</SectionLabel>
      {kit.colors.length ? (
        <>
          <div className="grid grid-cols-7 gap-2">
            {kit.colors.map((c, i) => {
              const current = isCurrent(c, sel, page?.background)
              return (
                <button
                  key={c + i}
                  onClick={() => applyColor(c)}
                  title={`${c}: apply to ${target}`}
                  aria-label={`Apply ${c} to ${target}`}
                  className={cx('aspect-square rounded-lg border transition hover:scale-105', current ? 'ring-2 ring-accent ring-offset-1 border-transparent' : 'border-black/10')}
                  style={{ background: c }}
                />
              )
            })}
          </div>
          <p className="text-[12px] text-muted mt-2">Click a color to use it on {target}.</p>
        </>
      ) : (
        <p className="text-[13px] text-muted">No colors in this kit yet.</p>
      )}

      <SectionLabel>Fonts</SectionLabel>
      <div className="flex flex-col gap-2">
        {(['heading', 'subheading', 'body'] as const).map((p) => {
          const family = kit.fonts[p] ?? FALLBACK[p]
          const cls = p === 'heading' ? 'h-14 text-[22px] font-bold' : p === 'subheading' ? 'h-11 text-[16px] font-semibold' : 'h-10 text-[13px]'
          return (
            <button
              key={p}
              onClick={() => addText(kit, p)}
              className={cx('text-left px-4 rounded-control border border-line hover:border-accent-line hover:bg-accent-wash/40 flex items-center justify-between gap-2', cls)}
            >
              <span className="truncate" style={{ fontFamily: `"${family}", Inter` }}>Add a {p}</span>
              <span className="text-[11px] font-normal text-faint shrink-0">{family}</span>
            </button>
          )
        })}
      </div>
      <Button
        className="mt-2"
        disabled={!kit.fonts.heading && !kit.fonts.subheading && !kit.fonts.body}
        onClick={() => {
          const n = applyFonts(kit)
          setNote(n ? `Changed the font on ${n} text box${n === 1 ? '' : 'es'}.` : 'Everything on this page already uses your brand fonts.')
        }}
      >
        <Icon name="text" size={15} /> Apply brand fonts to this page
      </Button>
      {note && <p className="text-[12px] text-muted mt-2" role="status">{note}</p>}

      <SectionLabel>Logos</SectionLabel>
      {kit.logos.length ? (
        <div className="grid grid-cols-2 gap-2">
          {kit.logos.map((l, i) => (
            <button
              key={l.url + i}
              onClick={() => addLogo(l)}
              title={`Add ${l.name || 'logo'}`}
              className="aspect-[4/3] rounded-tile border border-line bg-surface-2 p-3 flex items-center justify-center hover:border-accent-line hover:shadow-card-hover transition"
            >
              <img src={l.url} alt={l.name || 'Logo'} className="max-h-full max-w-full object-contain" draggable={false} />
            </button>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-muted">No logos yet. <a href="/brand" target="_blank" rel="noreferrer" className="text-accent hover:underline">Upload one</a>.</p>
      )}
    </div>
  )
}

function isCurrent(c: string, sel: DesignElement[], bg: { type: string; color?: string } | undefined) {
  const v = c.toLowerCase()
  if (!sel.length) return bg?.type === 'solid' && bg.color?.toLowerCase() === v
  return sel.every((el) =>
    el.type === 'text' ? el.color.toLowerCase() === v
      : el.type === 'shape' ? el.fill.type === 'solid' && el.fill.color.toLowerCase() === v
        : el.type === 'line' ? el.stroke.toLowerCase() === v
          : false,
  )
}
