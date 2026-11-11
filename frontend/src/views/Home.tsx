import { Icon } from '@/components/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { api, type DesignMeta } from '@/api/client'
import { AppRail } from '@/components/shell/AppRail'
import { Button, Chip, cx, Empty, Input, Spinner } from '@/components/ui/kit'
import { MenuList, Flyout } from '@/components/ui/Flyout'
import { blankDoc, openNewDesign, openTemplate } from '@/lib/create'
import { FORMATS, type Format } from '@/doc/formats'
import {
  deleteGuestDesign, duplicateGuestDesign, listGuestDesigns, updateGuestMeta, type GuestDesign,
} from '@/persistence/local'
import { importGuestDesigns } from '@/lib/guestImport'
import { restoreBackup } from '@/lib/backup'
import { useDesignThumb, useTemplateThumb } from '@/lib/templateThumbs'
import { useTemplates, type Template } from '@/lib/templates'
import { useAuth } from '@/stores/auth'

type Tab = 'create' | 'designs' | 'templates' | 'trash'

const TITLES: Record<Tab, string> = { create: 'Create', designs: 'Designs', templates: 'Templates', trash: 'Trash' }

type Card = { id: string; title: string; thumbnail: string; width: number; height: number; updated: number; href: string; guest: boolean }

function fromGuest(d: GuestDesign): Card {
  return { id: d.id, title: d.title, thumbnail: d.thumbnail, width: d.width, height: d.height, updated: d.updatedAt, href: `/local/${d.id}`, guest: true }
}
function fromServer(d: DesignMeta): Card {
  return { id: d.id, title: d.title, thumbnail: d.thumbnail, width: d.width, height: d.height, updated: Date.parse(d.updated_at), href: `/design/${d.id}`, guest: false }
}

function ago(t: number) {
  const s = (Date.now() - t) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function useDesigns(trash = false) {
  const user = useAuth((s) => s.user)
  const [items, setItems] = useState<Card[] | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let live = true
    setItems(null)
    const load = user
      ? api<{ designs: DesignMeta[] }>(`/api/designs?trash=${trash}`).then((r) => r.designs.map(fromServer))
      : listGuestDesigns(trash).then((r) => r.map(fromGuest))
    load.then((r) => live && setItems(r)).catch(() => live && setItems([]))
    return () => {
      live = false
    }
  }, [user, trash, tick])
  return { items, reload: () => setTick((t) => t + 1) }
}

export function Home({ tab }: { tab: Tab }) {
  const user = useAuth((s) => s.user)
  useEffect(() => {
    document.title = `${TITLES[tab]} · Krevaya`
  }, [tab])
  return (
    <div className="h-full flex bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-control focus:bg-ink focus:text-surface focus:text-[13px]">Skip to content</a>
      <AppRail />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-[68px] shrink-0 border-b border-line flex items-center gap-3 px-6">
          <div className="flex-1" />
          {user ? (
            <span className="text-[13px] text-muted">{user.email}</span>
          ) : (
            <>
              <span className="text-[13px] text-muted hidden md:inline">Guest mode: designs stay on this device until you sign in.</span>
              <Link href="/login"><Button variant="outline" size="sm">Sign in</Button></Link>
              <Link href="/signup"><Button variant="primary" size="sm">Create account</Button></Link>
            </>
          )}
        </header>
        <main id="main" tabIndex={-1} className="flex-1 overflow-y-auto scroll-thin outline-none">
          <div className="max-w-[1320px] mx-auto px-6 py-8">
            <GuestImportBanner />
            {tab === 'create' && <CreateTab />}
            {tab === 'designs' && <DesignsTab />}
            {tab === 'templates' && <TemplatesTab />}
            {tab === 'trash' && <TrashTab />}
          </div>
        </main>
      </div>
    </div>
  )
}

function PageTitle({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-6">
      <h1 className="font-display text-[30px] font-semibold tracking-tight text-ink">{title}</h1>
      <p className="text-[15px] text-muted mt-1">{sub}</p>
    </div>
  )
}

function GuestImportBanner() {
  const user = useAuth((s) => s.user)
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [, go] = useLocation()
  useEffect(() => {
    if (!user) return
    if (localStorage.getItem(`ka:imported:${user.id}`)) return
    listGuestDesigns().then((d) => setCount(d.length)).catch(() => {})
  }, [user])
  if (!user || !count) return null
  return (
    <div className="mb-6 rounded-card border border-accent-line bg-accent-wash px-5 py-4 flex items-center gap-4">
      <p className="flex-1 text-[14px] text-ink">
        {count} guest design{count > 1 ? 's are' : ' is'} still sitting on this device. Move {count > 1 ? 'them' : 'it'} into your account?
      </p>
      <Button variant="ghost" onClick={() => { localStorage.setItem(`ka:imported:${user.id}`, '1'); setCount(0) }}>Not now</Button>
      <Button
        variant="accent"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await importGuestDesigns()
            localStorage.setItem(`ka:imported:${user.id}`, '1')
            setCount(0)
            go('/designs')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Moving…' : 'Move designs'}
      </Button>
    </div>
  )
}

const GROUPS = ['Popular', 'Social', 'Video', 'Slides', 'Print', 'Other'] as const
const POPULAR = ['ig-post', 'story', 'presentation', 'yt-thumb', 'poster', 'flyer', 'business-card', 'resume']
const TINTS = ['#fde7f1', '#e9e4fb', '#e3f4f8', '#fff1dc', '#e6f6ea', '#f1f1f4']

function FormatCard({ f, i }: { f: Format; i: number }) {
  const ratio = f.width / f.height
  const h = 92
  const w = Math.min(130, h * ratio)
  return (
    <button onClick={() => void openNewDesign(f.label, blankDoc(f.width, f.height))} className="group shrink-0 w-[190px] text-left">
      <div className="h-[150px] rounded-card flex items-center justify-center transition group-hover:shadow-card-hover" style={{ background: `color-mix(in srgb, ${TINTS[i % TINTS.length]} var(--tint-strength), var(--surface))` }}>
        <div className="bg-white rounded-md shadow-sm border border-black/5 transition group-hover:-translate-y-0.5" style={{ width: w, height: w / ratio }} />
      </div>
      <p className="mt-2 text-[14px] font-medium text-ink">{f.label}</p>
      <p className="text-[12px] text-muted">{f.width} × {f.height} px</p>
    </button>
  )
}

function CustomSize() {
  const [w, setW] = useState(1080)
  const [h, setH] = useState(1080)
  return (
    <div className="shrink-0 w-[220px] h-[150px] rounded-card border border-dashed border-line-2 p-4 flex flex-col justify-between">
      <p className="text-[14px] font-medium">Custom size</p>
      <div className="flex items-center gap-1.5">
        <input type="number" value={w} min={16} max={8000} onChange={(e) => setW(Number(e.target.value))} className="w-full h-9 rounded-lg border border-line-2 px-2 text-[13px] bg-surface" aria-label="Width" />
        <span className="text-muted">×</span>
        <input type="number" value={h} min={16} max={8000} onChange={(e) => setH(Number(e.target.value))} className="w-full h-9 rounded-lg border border-line-2 px-2 text-[13px] bg-surface" aria-label="Height" />
      </div>
      <Button size="sm" variant="primary" disabled={w < 16 || h < 16 || w > 8000 || h > 8000} onClick={() => void openNewDesign('Untitled design', blankDoc(w, h))}>Create design</Button>
    </div>
  )
}

function CreateTab() {
  const [group, setGroup] = useState<(typeof GROUPS)[number]>('Popular')
  const { items } = useDesigns()
  const formats = group === 'Popular' ? POPULAR.map((id) => FORMATS.find((f) => f.id === id)!) : FORMATS.filter((f) => f.group === group)
  const [q, setQ] = useState('')
  const [, go] = useLocation()
  return (
    <>
      <PageTitle title="Create" sub="Pick a size to start from, or open a template and make it yours." />
      <form
        className="max-w-[680px] mx-auto mb-10"
        onSubmit={(e) => {
          e.preventDefault()
          go(`/templates?q=${encodeURIComponent(q)}`)
        }}
      >
        <Input icon={<Icon name="search" size={18} />} placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} className="[&_input]:h-12 [&_input]:rounded-card [&_input]:text-[15px]" />
      </form>

      {items && items.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[18px] font-semibold">Jump back in</h2>
            <Link href="/designs" className="text-[13px] text-muted hover:text-ink">See all</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto scroll-thin pb-2">
            {items.slice(0, 10).map((d) => <HomeCard key={d.id} d={d} compact />)}
          </div>
        </section>
      )}

      <section className="mb-10">
        <div className="flex items-center justify-between gap-4 mb-3 flex-wrap">
          <h2 className="text-[18px] font-semibold">Start something new</h2>
          <div className="flex gap-2 flex-wrap">
            {GROUPS.map((g) => <Chip key={g} active={g === group} onClick={() => setGroup(g)}>{g}</Chip>)}
          </div>
        </div>
        <div className="flex gap-4 overflow-x-auto scroll-thin pb-2">
          {formats.map((f, i) => <FormatCard key={f.id} f={f} i={i} />)}
          <CustomSize />
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[18px] font-semibold">Templates</h2>
          <Link href="/templates" className="text-[13px] text-muted hover:text-ink">See all</Link>
        </div>
        <TemplateGrid limit={10} />
      </section>
    </>
  )
}

function Thumb({ d }: { d: { thumbnail: string; width: number; height: number; title: string } }) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-surface-2">
      {d.thumbnail ? (
        <img src={d.thumbnail} alt="" className="max-h-full max-w-full object-contain shadow-sm" loading="lazy" draggable={false} />
      ) : (
        <div className="bg-white border border-line shadow-sm" style={{ aspectRatio: `${d.width} / ${d.height}`, height: d.height >= d.width ? '80%' : undefined, width: d.width > d.height ? '80%' : undefined }} />
      )}
    </div>
  )
}

function HomeCard({ d, compact, onChange, trash }: { d: Card; compact?: boolean; onChange?: () => void; trash?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState(false)
  const [, go] = useLocation()
  const duplicate = async () => {
    if (d.guest) await duplicateGuestDesign(d.id)
    else await api(`/api/designs/${d.id}/duplicate`, { method: 'POST' })
    onChange?.()
  }
  const remove = async (permanent = false) => {
    if (permanent && !confirm(`Delete "${d.title}" for good? This can't be undone.`)) return
    if (d.guest) await deleteGuestDesign(d.id, permanent)
    else await api(`/api/designs/${d.id}${permanent ? '?permanent=true' : ''}`, { method: 'DELETE' })
    onChange?.()
  }
  const restore = async () => {
    if (d.guest) await updateGuestMeta(d.id, { deletedAt: null })
    else await api(`/api/designs/${d.id}/restore`, { method: 'POST' })
    onChange?.()
  }
  const thumbnail = useDesignThumb(d.id, d.thumbnail, d.guest || !!trash)
  return (
    <div className={cx('group relative', compact ? 'shrink-0 w-[180px]' : '')}>
      <button onClick={() => !trash && go(d.href)} className={cx('block w-full rounded-card border border-line overflow-hidden transition hover:shadow-card-hover', compact ? 'h-[200px]' : 'aspect-[4/3]')}>
        <Thumb d={{ ...d, thumbnail }} />
      </button>
      <div className="mt-2 flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-ink truncate">{d.title}</p>
          <p className="text-[12px] text-muted flex items-center gap-1"><Icon name="clock" size={11} />{ago(d.updated)}</p>
        </div>
        {!compact && (
          <>
            <button ref={ref} onClick={() => setMenu(!menu)} className="h-7 w-7 rounded-lg hover:bg-hover flex items-center justify-center text-muted" aria-label="More"><Icon name="more" size={16} /></button>
            <Flyout anchor={ref.current} open={menu} onClose={() => setMenu(false)} place="bottom-end">
              <MenuList
                onClose={() => setMenu(false)}
                items={
                  trash
                    ? [
                        { label: 'Restore', icon: <Icon name="rotate-ccw" size={14} />, onSelect: restore },
                        { label: 'Delete forever', icon: <Icon name="trash" size={14} />, danger: true, onSelect: () => remove(true) },
                      ]
                    : [
                        { label: 'Open', onSelect: () => go(d.href) },
                        { label: 'Make a copy', icon: <Icon name="copy" size={14} />, onSelect: duplicate },
                        { label: 'Move to trash', icon: <Icon name="trash" size={14} />, danger: true, onSelect: () => remove() },
                      ]
                }
              />
            </Flyout>
          </>
        )}
      </div>
    </div>
  )
}

function DesignsTab() {
  const { items, reload } = useDesigns()
  const [q, setQ] = useState('')
  const shown = useMemo(() => (items ?? []).filter((d) => d.title.toLowerCase().includes(q.toLowerCase())), [items, q])
  return (
    <>
      <PageTitle title="Your designs" sub="Everything you've made, newest first." />
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 max-w-[420px]">
          <Input icon={<Icon name="search" size={16} />} placeholder="Search your designs" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <OpenBackup />
      </div>
      {!items ? (
        <div className="py-16 flex justify-center"><Spinner /></div>
      ) : shown.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
          {shown.map((d) => <HomeCard key={d.id} d={d} onChange={reload} />)}
        </div>
      ) : (
        <Empty title={q ? 'Nothing matches that search' : 'No designs yet'}>{q ? 'Try another word.' : 'Start one from the Create page or pick a template.'}</Empty>
      )}
    </>
  )
}

function OpenBackup() {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const open = async (f: File) => {
    setBusy(true)
    setError('')
    try {
      await restoreBackup(f)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()} title="Open a design saved with File › Save a backup file">
        {busy ? <Spinner /> : <Icon name="upload" size={15} />} Open a backup
      </Button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) void open(f)
        }}
      />
      {error && <span className="text-[13px] text-danger">{error}</span>}
    </>
  )
}

function TrashTab() {
  const { items, reload } = useDesigns(true)
  return (
    <>
      <PageTitle title="Trash" sub="Designs you've deleted. Restore them, or delete them for good." />
      {!items ? (
        <div className="py-16 flex justify-center"><Spinner /></div>
      ) : items.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-5">
          {items.map((d) => <HomeCard key={d.id} d={d} onChange={reload} trash />)}
        </div>
      ) : (
        <Empty title="Trash is empty" />
      )}
    </>
  )
}

function TemplateThumb({ t }: { t: Template }) {
  const thumbnail = useTemplateThumb(t)
  return <Thumb d={{ ...t, thumbnail }} />
}

function TemplateGrid({ limit, category = '', q = '' }: { limit?: number; category?: string; q?: string }) {
  const data = useTemplates(category, q)
  const [busy, setBusy] = useState<string | null>(null)
  if (!data) return <div className="py-10 flex justify-center"><Spinner /></div>
  const list = limit ? data.templates.slice(0, limit) : data.templates
  if (!list.length) return <Empty title="No templates here yet">An admin can add templates from any design with File → Save as template.</Empty>
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-5">
      {list.map((t) => (
        <button
          key={t.id}
          disabled={busy !== null}
          onClick={async () => {
            setBusy(t.id)
            try {
              await openTemplate(t.id, t.title)
            } finally {
              setBusy(null)
            }
          }}
          className="text-left group"
        >
          <div className="aspect-[4/5] rounded-card border border-line overflow-hidden transition group-hover:shadow-card-hover relative">
            <TemplateThumb t={t} />
            {busy === t.id && <div className="absolute inset-0 bg-white/60 flex items-center justify-center"><Spinner /></div>}
          </div>
          <p className="mt-2 text-[14px] font-medium truncate">{t.title}</p>
          <p className="text-[12px] text-muted capitalize">{t.template_category || 'Template'}</p>
        </button>
      ))}
    </div>
  )
}

function TemplatesTab() {
  const initial = new URLSearchParams(location.search).get('q') ?? ''
  const [q, setQ] = useState(initial)
  const [cat, setCat] = useState('')
  const all = useTemplates()
  return (
    <>
      <PageTitle title="Templates" sub="Pick one, change anything on it, make it yours." />
      <div className="max-w-[520px] mb-4">
        <Input icon={<Icon name="search" size={16} />} placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="flex gap-2 flex-wrap mb-6">
        <Chip active={!cat} onClick={() => setCat('')}>All</Chip>
        {(all?.categories ?? []).map((c) => <Chip key={c} active={cat === c} onClick={() => setCat(c)} className="capitalize">{c}</Chip>)}
      </div>
      <TemplateGrid category={cat} q={q} />
    </>
  )
}
