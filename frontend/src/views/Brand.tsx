import { Icon } from '@/components/icons'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'wouter'
import { upload } from '@/api/client'
import { AppRail } from '@/components/shell/AppRail'
import { Button, Card, cx, Empty, Spinner } from '@/components/ui/kit'
import { TypefaceMenu } from '@/editor/TypefaceMenu'
import { ensureFontCatalog } from '@/editor/fonts'
import { isHex, normalizeHex } from '@/lib/color'
import { ensureFont } from '@/render/assets'
import { useAuth } from '@/stores/auth'
import { useBrand, type BrandKit } from '@/stores/brand'

type FontSlot = 'heading' | 'subheading' | 'body'
const SLOTS: Array<{ slot: FontSlot; label: string; sample: string; size: number; weight: number; fallback: string }> = [
  { slot: 'heading', label: 'Heading', sample: 'Big, bold headline', size: 28, weight: 700, fallback: 'Outfit' },
  { slot: 'subheading', label: 'Subheading', sample: 'A supporting line', size: 19, weight: 600, fallback: 'Inter' },
  { slot: 'body', label: 'Body', sample: 'Body text for the details people read up close.', size: 14, weight: 400, fallback: 'Inter' },
]

export default function Brand() {
  const user = useAuth((s) => s.user)
  const kits = useBrand((s) => s.kits)
  const loaded = useBrand((s) => s.loaded)
  const [selected, setSelected] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    document.title = 'Brand · Krevaya'
  }, [])
  useEffect(() => {
    if (user && !loaded) void useBrand.getState().load()
  }, [user, loaded])

  const kit = kits.find((k) => k.id === selected) ?? kits[0] ?? null

  const create = async () => {
    setError('')
    try {
      const k = await useBrand.getState().save({ name: kits.length ? `Brand kit ${kits.length + 1}` : 'My brand' })
      setSelected(k.id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="h-full flex bg-surface">
      <AppRail />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-[68px] shrink-0 border-b border-line flex items-center gap-3 px-6">
          <div className="flex-1" />
          {user && <Button variant="primary" size="sm" onClick={() => void create()}><Icon name="plus" size={15} /> New brand kit</Button>}
        </header>
        <main className="flex-1 overflow-y-auto scroll-thin">
          <div className="max-w-[1000px] mx-auto px-6 py-8">
            <div className="mb-6">
              <h1 className="font-display text-[30px] font-semibold tracking-tight text-ink">Brand</h1>
              <p className="text-[15px] text-muted mt-1">Your palette, typefaces and logos, set up once and a click away in the editor.</p>
            </div>
            {!user ? (
              <div className="rounded-card border border-accent-line bg-accent-wash px-5 py-4 flex items-center gap-4 flex-wrap">
                <p className="flex-1 min-w-[220px] text-[14px] text-ink">Brand kits are saved with your account so they're there in every design. Sign in or create a free account to make one.</p>
                <Link href="/login?next=/brand"><Button variant="outline">Sign in</Button></Link>
                <Link href="/signup?next=/brand"><Button variant="primary">Create account</Button></Link>
              </div>
            ) : !loaded ? (
              <div className="py-16 flex justify-center"><Spinner /></div>
            ) : !kit ? (
              <Card className="py-6">
                <Empty title="No brand kits yet">Make one for each brand, client or project you design for.</Empty>
                <div className="flex justify-center pb-4"><Button variant="primary" onClick={() => void create()}><Icon name="palette" size={16} /> Create a brand kit</Button></div>
              </Card>
            ) : (
              <>
                {kits.length > 1 && (
                  <div className="flex gap-2 flex-wrap mb-5" role="tablist" aria-label="Brand kits">
                    {kits.map((k) => (
                      <button
                        key={k.id}
                        role="tab"
                        aria-selected={k.id === kit.id}
                        onClick={() => setSelected(k.id)}
                        className={cx('h-9 pl-1.5 pr-3.5 rounded-full border text-[13px] flex items-center gap-2', k.id === kit.id ? 'bg-accent-wash border-accent-line text-accent font-medium' : 'border-line-2 text-ink-2 hover:bg-hover')}
                      >
                        <span className="h-6 w-6 rounded-full border border-black/10" style={{ background: k.colors[0] ?? '#e9e4fb' }} />
                        {k.name}
                      </button>
                    ))}
                  </div>
                )}
                <KitEditor key={kit.id} kit={kit} onError={setError} />
              </>
            )}
            {error && <p className="text-[13px] text-danger mt-4" role="alert">{error}</p>}
          </div>
        </main>
      </div>
    </div>
  )
}

function Section({ title, sub, children, action }: { title: string; sub?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
          {sub && <p className="text-[13px] text-muted mt-0.5">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  )
}

type Save = (patch: Partial<BrandKit> | ((kit: BrandKit) => Partial<BrandKit>)) => void

function KitEditor({ kit: saved, onError }: { kit: BrandKit; onError: (e: string) => void }) {
  // edits show straight away and reach the server a moment later, so dragging
  // a color picker doesn't send a request per pixel
  const [kit, setKit] = useState(saved)
  const latest = useRef(saved)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [name, setName] = useState(saved.name)
  const flush = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    useBrand.getState().save(latest.current).catch((e: Error) => onError(e.message))
  }
  const save: Save = (patch) => {
    onError('')
    latest.current = { ...latest.current, ...(typeof patch === 'function' ? patch(latest.current) : patch) }
    setKit(latest.current)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(flush, 400)
  }
  useEffect(() => () => {
    if (timer.current) flush()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const remove = async () => {
    if (!confirm(`Delete the brand kit "${kit.name}"? Designs that use its colors and fonts keep them.`)) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    try {
      await useBrand.getState().remove(kit.id)
    } catch (e) {
      onError((e as Error).message)
    }
  }
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== kit.name && save({ name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          maxLength={120}
          aria-label="Brand kit name"
          className="flex-1 min-w-0 h-11 px-3 -ml-3 rounded-control text-[22px] font-semibold text-ink bg-transparent border border-transparent hover:border-line focus:border-accent-soft outline-none"
        />
        <Button variant="danger" size="sm" onClick={() => void remove()}><Icon name="trash" size={14} /> Delete kit</Button>
      </div>
      <Colors kit={kit} save={save} />
      <Fonts kit={kit} save={save} />
      <Logos kit={kit} save={save} onError={onError} />
    </div>
  )
}

function Colors({ kit, save }: { kit: BrandKit; save: Save }) {
  const [drag, setDrag] = useState<number | null>(null)
  const [hex, setHex] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const colors = kit.colors
  const add = (c: string) => {
    const v = normalizeHex(c)
    if (!colors.some((x) => x.toLowerCase() === v.toLowerCase())) save({ colors: [...colors, v] })
  }
  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= colors.length) return
    const next = [...colors]
    const [c] = next.splice(from, 1)
    next.splice(to, 0, c)
    save({ colors: next })
  }
  return (
    <Section title="Colors" sub="Drag to reorder. The first color is used for the kit's badge.">
      <div className="flex flex-wrap gap-3">
        {colors.map((c, i) => (
          <div
            key={c + i}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (drag !== null) move(drag, i)
              setDrag(null)
            }}
            onDragEnd={() => setDrag(null)}
            className={cx('group relative flex flex-col items-center gap-1.5 cursor-grab', drag === i && 'opacity-40')}
          >
            <label className="relative h-16 w-16 rounded-tile border border-black/10 shadow-card overflow-hidden cursor-pointer" style={{ background: c }} title="Change color">
              <input
                type="color"
                value={isHex(c) ? normalizeHex(c) : '#000000'}
                onChange={(e) => save({ colors: colors.map((x, j) => (j === i ? e.target.value : x)) })}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label={`Change color ${c}`}
              />
            </label>
            <span className="text-[11px] font-mono text-muted uppercase">{c}</span>
            <button
              onClick={() => save({ colors: colors.filter((_, j) => j !== i) })}
              className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-surface border border-line-2 text-muted hover:text-danger hidden group-hover:flex group-focus-within:flex items-center justify-center shadow"
              aria-label={`Remove ${c}`}
            >
              <Icon name="x" size={11} />
            </button>
            <div className="sr-only group-focus-within:not-sr-only flex gap-1">
              <button className="text-[11px] text-muted" onClick={() => move(i, i - 1)} aria-label={`Move ${c} left`}>←</button>
              <button className="text-[11px] text-muted" onClick={() => move(i, i + 1)} aria-label={`Move ${c} right`}>→</button>
            </div>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1.5">
          <button onClick={() => picker.current?.click()} className="h-16 w-16 rounded-tile border border-dashed border-line-2 text-muted hover:bg-hover flex items-center justify-center" aria-label="Add a color">
            <Icon name="plus" size={20} />
          </button>
          <input ref={picker} type="color" className="sr-only" tabIndex={-1} onChange={(e) => add(e.target.value)} aria-hidden />
          <span className="text-[11px] text-muted">Add</span>
        </div>
      </div>
      <form
        className="mt-4 flex items-center gap-2 max-w-[280px]"
        onSubmit={(e) => {
          e.preventDefault()
          if (isHex(hex)) {
            add(hex)
            setHex('')
          }
        }}
      >
        <input value={hex} onChange={(e) => setHex(e.target.value)} placeholder="#612BD3" aria-label="Hex color" className="flex-1 h-9 rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] font-mono uppercase outline-none focus:border-accent-soft" />
        <Button size="sm" className="h-9" type="submit" disabled={!isHex(hex)}>Add hex</Button>
      </form>
    </Section>
  )
}

function Fonts({ kit, save }: { kit: BrandKit; save: Save }) {
  useEffect(() => {
    // the catalog isn't loaded outside the editor, and the defaults need it too
    void ensureFontCatalog().then(() => {
      for (const s of SLOTS) void ensureFont(kit.fonts[s.slot] ?? s.fallback, s.weight)
    })
  }, [kit.fonts])
  return (
    <Section title="Fonts" sub="Used when you add text from the Text or Brand panels.">
      <div className="flex flex-col divide-y divide-line">
        {SLOTS.map((s) => {
          const family = kit.fonts[s.slot]
          return (
            <div key={s.slot} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
              <span className="w-24 shrink-0 text-[13px] font-medium text-ink-2">{s.label}</span>
              <p className="flex-1 min-w-0 truncate text-ink" style={{ fontFamily: `"${family ?? s.fallback}", Inter`, fontSize: s.size, fontWeight: s.weight }}>{s.sample}</p>
              <TypefaceMenu value={family ?? s.fallback} onChange={(f) => save({ fonts: { ...kit.fonts, [s.slot]: f } })} />
              {family ? (
                <button onClick={() => { const fonts = { ...kit.fonts }; delete fonts[s.slot]; save({ fonts }) }} className="h-8 w-8 shrink-0 rounded-lg text-muted hover:bg-hover flex items-center justify-center" aria-label={`Clear ${s.label.toLowerCase()} font`} title="Use the default">
                  <Icon name="x" size={14} />
                </button>
              ) : (
                <span className="w-8 shrink-0" />
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function imageSize(file: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      resolve({ width: img.naturalWidth || 512, height: img.naturalHeight || 512 })
      URL.revokeObjectURL(url)
    }
    img.onerror = () => {
      resolve({ width: 512, height: 512 })
      URL.revokeObjectURL(url)
    }
    img.src = url
  })
}

function Logos({ kit, save, onError }: { kit: BrandKit; save: Save; onError: (e: string) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const addFiles = async (files: FileList) => {
    setBusy(true)
    onError('')
    const added: BrandKit['logos'] = []
    try {
      for (const f of Array.from(files)) {
        const asset = await upload<{ url: string; width: number | null; height: number | null; filename: string }>('/api/assets', f)
        const size = asset.width && asset.height ? { width: asset.width, height: asset.height } : await imageSize(f)
        added.push({ url: asset.url, ...size, name: f.name.replace(/\.[^.]+$/, '') })
      }
    } catch (e) {
      onError((e as Error).message)
    } finally {
      if (added.length) save((k) => ({ logos: [...k.logos, ...added] }))
      setBusy(false)
    }
  }
  return (
    <Section
      title="Logos"
      sub="PNG with a transparent background or SVG works best."
      action={
        <>
          <Button size="sm" disabled={busy} onClick={() => input.current?.click()}>{busy ? <Spinner /> : <Icon name="upload" size={14} />} Upload</Button>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" multiple hidden onChange={(e) => e.target.files?.length && void addFiles(e.target.files)} />
        </>
      }
    >
      {kit.logos.length === 0 ? (
        <button onClick={() => input.current?.click()} className="w-full h-28 rounded-tile border border-dashed border-line-2 text-[13px] text-muted hover:bg-hover flex flex-col items-center justify-center gap-1.5">
          <Icon name="upload" size={18} /> Upload your logo
        </button>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
          {kit.logos.map((l, i) => (
            <div key={l.url + i} className="group relative">
              <div className="aspect-[4/3] rounded-tile border border-line bg-surface-2 p-3 flex items-center justify-center">
                <img src={l.url} alt={l.name ?? 'Logo'} className="max-h-full max-w-full object-contain" />
              </div>
              <p className="text-[12px] text-muted mt-1 truncate">{l.name || 'Logo'}</p>
              <button
                onClick={() => save({ logos: kit.logos.filter((_, j) => j !== i) })}
                className="absolute top-1.5 right-1.5 h-7 w-7 rounded-lg bg-surface/90 border border-line text-muted hover:text-danger hidden group-hover:flex group-focus-within:flex items-center justify-center"
                aria-label={`Remove ${l.name || 'logo'}`}
              >
                <Icon name="trash" size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}
