import { Icon } from '@/components/icons'
import { ApiError, api, upload } from '@/api/client'
import { Button, Input, ChoiceRow, SectionLabel, Spinner } from '@/components/ui/kit'
import { newText, type TypeStyle } from '@/doc/factory'
import { useAuth } from '@/stores/auth'
import { useBrand } from '@/stores/brand'
import { useEditor } from '@/stores/editor'
import { addElement, addElements, currentPage } from '../actions'
import { FONT_PAIRINGS, reloadFonts } from '../fonts'
import { ensureFont, type FontInfo } from '@/render/assets'
import { useCallback, useEffect, useRef, useState } from 'react'

function add(preset: TypeStyle, family?: string) {
  const page = currentPage()
  if (!page) return
  const brand = useBrand.getState().active?.fonts
  const fontFamily = family ?? brand?.[preset] ?? (preset === 'heading' ? 'Outfit' : 'Inter')
  addElement(newText(page, preset, { fontFamily }))
}

function insertFontCombo(heading: string, body: string) {
  const page = currentPage()
  if (!page) return
  const h = newText(page, 'heading', { fontFamily: heading, text: 'Your big idea' })
  const b = newText(page, 'body', { fontFamily: body, text: 'A short line that explains it in plain words.' })
  const gap = h.fontSize * 0.35
  const total = h.height + gap + b.height
  h.y = (page.height - total) / 2
  b.y = h.y + h.height + gap
  addElements([h, b])
}

export default function TypePane() {
  useEffect(() => {
    for (const p of FONT_PAIRINGS) {
      void ensureFont(p.heading, 700)
      void ensureFont(p.body, 400)
    }
  }, [])
  return (
    <div className="flex flex-col">
      <Button variant="primary" className="w-full rounded-full" onClick={() => add('body')}>
        <Icon name="plus" size={16} /> Add a text box
      </Button>
      <SectionLabel>Default text styles</SectionLabel>
      <div className="flex flex-col gap-2">
        <button onClick={() => add('heading')} className="text-left h-14 px-4 rounded-control border border-line hover:border-accent-line hover:bg-accent-wash/40 text-[24px] font-bold font-display">Headline</button>
        <button onClick={() => add('subheading')} className="text-left h-11 px-4 rounded-control border border-line hover:border-accent-line hover:bg-accent-wash/40 text-[16px] font-semibold">Supporting line</button>
        <button onClick={() => add('body')} className="text-left h-10 px-4 rounded-control border border-line hover:border-accent-line hover:bg-accent-wash/40 text-[13px]">Paragraph</button>
      </div>
      <SectionLabel>Font pairings</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        {FONT_PAIRINGS.map((p) => (
          <button key={p.label} onClick={() => insertFontCombo(p.heading, p.body)} className="h-[88px] rounded-control border border-line p-3 text-left hover:border-accent-line hover:shadow-card-hover transition flex flex-col justify-between">
            <span className="text-[19px] leading-tight text-ink" style={{ fontFamily: `"${p.heading}", Outfit`, fontWeight: 700 }}>{p.label}</span>
            <span className="text-[11px] text-muted truncate" style={{ fontFamily: `"${p.body}", Inter` }}>{p.heading} + {p.body}</span>
          </button>
        ))}
      </div>
      <p className="text-[12px] text-muted mt-3">Each lands as a text layer you can edit. Double-click text on the page to type.</p>
      <UploadedFonts />
    </div>
  )
}

// Custom fonts

type OwnFont = FontInfo & { id: string }

const WEIGHTS: Array<[number, string]> = [
  [100, 'Thin'], [200, 'Extra light'], [300, 'Light'], [400, 'Regular'], [500, 'Medium'],
  [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold'], [900, 'Black'],
]
const WEIGHT_WORDS: Array<[RegExp, number]> = [
  [/thin|hairline/i, 100], [/extra-?light|ultra-?light/i, 200], [/light/i, 300], [/medium/i, 500],
  [/semi-?bold|demi-?bold/i, 600], [/extra-?bold|ultra-?bold/i, 800], [/bold/i, 700], [/black|heavy/i, 900],
]

/** Best guess at family, weight and style from a file name like "Brand-SemiBoldItalic.otf". */
function guessFromFile(name: string) {
  const base = name.replace(/\.(ttf|otf|woff2?)$/i, '')
  const [fam, ...rest] = base.split(/[-_]/)
  const tail = rest.join('-') || base
  const weight = WEIGHT_WORDS.find(([re]) => re.test(tail))?.[1] ?? 400
  const italic = /italic|oblique/i.test(tail)
  const family = (fam || base).replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return { family, weight, style: italic ? 'italic' as const : 'normal' as const }
}

function UploadedFonts() {
  // people on a share link without an account can't keep fonts either
  const signedIn = useAuth((s) => !!s.user)
  const guest = useEditor((s) => s.guest) || !signedIn
  const [fonts, setFonts] = useState<OwnFont[] | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [family, setFamily] = useState('')
  const [weight, setWeight] = useState(400)
  const [style, setStyle] = useState<'normal' | 'italic'>('normal')
  const [rights, setRights] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ fonts: OwnFont[] }>('/api/fonts')
      const own = r.fonts.filter((f) => f.custom)
      for (const f of own) void ensureFont(f.family, 400)
      setFonts(own)
    } catch {
      setFonts([])
    }
  }, [])

  useEffect(() => {
    if (!guest) void refresh()
  }, [guest, refresh])

  if (guest) return <p className="text-[12px] text-muted mt-5">Your own font files are stored with your account. Sign in and open a saved design to add some.</p>

  const pick = (f: File | undefined) => {
    if (!f) return
    setFile(f)
    setError('')
    const g = guessFromFile(f.name)
    setFamily(g.family)
    setWeight(g.weight)
    setStyle(g.style)
  }

  const send = async () => {
    if (!file || !family.trim() || !rights) return
    setBusy(true)
    setError('')
    try {
      await upload('/api/fonts', file, { family: family.trim(), weight: String(weight), style })
      setFile(null)
      if (input.current) input.current.value = ''
      await reloadFonts()
      await refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Upload failed. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (f: OwnFont) => {
    if (!window.confirm(`Delete ${f.family}? Text using it will fall back to another font.`)) return
    try {
      await api(`/api/fonts/${f.id}`, { method: 'DELETE' })
      await reloadFonts()
      await refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not delete that font.')
    }
  }

  return (
    <>
      <SectionLabel>Your fonts</SectionLabel>
      {fonts === null ? (
        <div className="py-3 flex justify-center"><Spinner /></div>
      ) : fonts.length > 0 && (
        <ul className="flex flex-col gap-1.5 mb-3">
          {fonts.map((f) => (
            <li key={f.id} className="flex items-center gap-2 h-11 pl-3 pr-1 rounded-control border border-line">
              <button onClick={() => add('body', f.family)} className="flex-1 min-w-0 text-left" title={`Add text in ${f.family}`}>
                <span className="block truncate text-[15px] text-ink" style={{ fontFamily: `"${f.family}", Inter` }}>{f.family}</span>
              </button>
              <span className="text-[11px] text-muted shrink-0">{f.files.length} {f.files.length === 1 ? 'style' : 'styles'}</span>
              <button onClick={() => void remove(f)} aria-label={`Delete ${f.family}`} title="Delete font" className="h-8 w-8 rounded-lg text-muted hover:text-danger hover:bg-hover flex items-center justify-center shrink-0">
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3 p-3.5 rounded-control border border-line">
        <input ref={input} type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <Button variant="outline" onClick={() => input.current?.click()} className="w-full">
          <Icon name="upload" size={15} /> <span className="truncate">{file ? file.name : 'Choose a font file'}</span>
        </Button>
        {file && (
          <>
            <Input placeholder="Font name" value={family} onChange={(e) => setFamily(e.target.value)} aria-label="Font name" />
            <div className="flex flex-col gap-2">
              <select
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                aria-label="Weight"
                className="h-10 rounded-control border border-line-2 bg-surface text-ink text-sm px-2"
              >
                {WEIGHTS.map(([w, l]) => <option key={w} value={w}>{l} ({w})</option>)}
              </select>
              <ChoiceRow value={style} onChange={setStyle} options={[{ value: 'normal', label: 'Upright' }, { value: 'italic', label: 'Italic' }]} />
            </div>
          </>
        )}
        <label className="flex items-start gap-2 text-[12px] text-ink-2 leading-snug">
          <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5" />
          I have the right to use this font
        </label>
        {error && <p className="text-[12px] text-danger">{error}</p>}
        <Button variant="primary" onClick={() => void send()} disabled={!file || !family.trim() || !rights || busy}>
          {busy ? <Spinner /> : 'Upload font'}
        </Button>
        <p className="text-[11px] text-muted">TTF, OTF, WOFF or WOFF2, up to 8 MB. Upload each weight or italic as its own file under the same name.</p>
      </div>
    </>
  )
}
