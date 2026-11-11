import { Icon } from '@/components/icons'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from '@/components/ui/kit'
import { Flyout } from '@/components/ui/Flyout'
import { ensureFont } from '@/render/assets'
import { useBrand } from '@/stores/brand'
import { ensureFontCatalog, fontList } from './fonts'

export function TypefaceMenu({ value, onChange }: { value: string; onChange: (family: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [loaded, bump] = useState(0)
  const brand = useBrand((s) => s.active?.fonts)

  useEffect(() => {
    if (open) void ensureFontCatalog().then(() => bump((n) => n + 1))
  }, [open])

  const fonts = useMemo(() => {
    const all = fontList()
    const needle = q.trim().toLowerCase()
    return needle ? all.filter((f) => f.family.toLowerCase().includes(needle)) : all
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, open, loaded])
  const brandFonts = [...new Set([brand?.heading, brand?.subheading, brand?.body].filter(Boolean) as string[])]

  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen(!open)}
        className="h-8 w-[150px] px-2.5 flex items-center justify-between gap-1 rounded-lg border border-line-2 text-[13px] hover:bg-hover"
        aria-label="Font"
      >
        <span className="truncate" style={{ fontFamily: `"${value}", Inter` }}>{value}</span>
        <Icon name="chevron-down" size={13} className="text-muted shrink-0" />
      </button>
      <Flyout anchor={ref.current} open={open} onClose={() => { setOpen(false); setQ('') }} className="w-[280px]">
        <div className="p-3 border-b border-line">
          <label className="relative flex items-center">
            <Icon name="search" size={14} className="absolute left-2.5 text-faint" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search fonts" className="w-full h-9 pl-8 pr-2 rounded-lg border border-line-2 text-[13px] bg-surface outline-none focus:border-accent-soft" />
          </label>
        </div>
        <div className="max-h-[360px] overflow-y-auto scroll-thin py-1.5">
          {brandFonts.length > 0 && !q && (
            <>
              <p className="px-3.5 pt-1 pb-1 text-[11px] uppercase tracking-wider text-faint">Brand fonts</p>
              {brandFonts.map((f) => <FontRow key={'b' + f} family={f} active={f === value} onPick={(v) => { onChange(v); setOpen(false) }} />)}
              <p className="px-3.5 pt-3 pb-1 text-[11px] uppercase tracking-wider text-faint">All fonts</p>
            </>
          )}
          {fonts.map((f) => <FontRow key={f.family} family={f.family} active={f.family === value} onPick={(v) => { onChange(v); setOpen(false); setQ('') }} />)}
          {!fonts.length && <p className="px-4 py-6 text-[13px] text-muted text-center">No fonts match "{q}"</p>}
        </div>
      </Flyout>
    </>
  )
}

function FontRow({ family, active, onPick }: { family: string; active: boolean; onPick: (f: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  // Load each font as it scrolls into view so the list previews itself.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        void ensureFont(family, 400)
        io.disconnect()
      }
    })
    io.observe(el)
    return () => io.disconnect()
  }, [family])
  return (
    <button
      ref={ref}
      onClick={() => onPick(family)}
      className={cx('w-[calc(100%-12px)] mx-1.5 h-9 px-2.5 rounded-lg text-left text-[15px] truncate', active ? 'bg-accent-wash text-accent' : 'hover:bg-hover')}
      style={{ fontFamily: `"${family}", Inter` }}
    >
      {family}
    </button>
  )
}
