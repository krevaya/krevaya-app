import { useEffect, useState } from 'react'
import { api, type DesignMeta } from '@/api/client'
import { Button, ChoiceRow, Input, Spinner } from '@/components/ui/kit'
import { Modal } from '@/components/ui/Flyout'
import { updateElement } from '@/editor/actions'
import type { ModalProps } from '@/editor/modals'
import { useSelected } from '@/editor/hooks'
import { useAuth } from '@/stores/auth'
import { AppearanceControls } from './Appearance'
import { useEditor } from '@/stores/editor'

export function AccessibilityModal({ onClose }: ModalProps) {
  return (
    <Modal open onClose={onClose} title="Accessibility" width={460}>
      <div className="flex flex-col gap-5">
        <AppearanceControls />
        <div className="rounded-control bg-surface-2 border border-line p-3 text-[12px] text-muted leading-relaxed">
          <p className="font-medium text-ink-2 mb-1">Motion</p>
          The editor keeps its own movement to a minimum. Animations you add to a design only play when you present it or
          export a video, so you can leave them out if motion bothers your audience.
        </div>
        <p className="text-[12px] text-muted">
          Everything in the editor works from the keyboard. Press <kbd className="px-1 rounded border border-line-2">?</kbd> to see the shortcuts.
        </p>
      </div>
    </Modal>
  )
}

type UAData = { platform?: string }

function onApple(): boolean {
  if (typeof navigator === 'undefined') return false
  const hint = (navigator as Navigator & { userAgentData?: UAData }).userAgentData?.platform
  return /mac|ios/i.test(hint ?? '') || (!hint && /Macintosh|iPhone|iPad/.test(navigator.userAgent))
}

const apple = onApple()
const CMD = apple ? '⌘' : 'Ctrl'
const SHIFT = apple ? '⇧' : 'Shift'
const OPT = apple ? '⌥' : 'Alt'
const combo = (...keys: string[]) => keys.join(apple ? '' : '+')

type KeyTab = 'everyday' | 'layers' | 'view'

const KEYS: Record<KeyTab, Array<[string, string]>> = {
  everyday: [
    ['Copy', combo(CMD, 'C')],
    ['Paste', combo(CMD, 'V')],
    ['Cut', combo(CMD, 'X')],
    ['Make a copy in place', combo(CMD, 'D')],
    ['Undo', combo(CMD, 'Z')],
    ['Redo', combo(SHIFT, CMD, 'Z')],
    ['Select everything', combo(CMD, 'A')],
    ['Clear the selection', 'Esc'],
    ['Delete', '⌫'],
    ['Find and replace text', combo(CMD, 'F')],
    ['This list', '?'],
  ],
  layers: [
    ['Shift by 1 px', '← ↑ → ↓'],
    ['Shift by 10 px', combo(SHIFT, '← ↑ → ↓')],
    ['Up one layer', combo(CMD, ']')],
    ['Down one layer', combo(CMD, '[')],
    ['To the very top', combo(OPT, CMD, ']')],
    ['To the very bottom', combo(OPT, CMD, '[')],
    ['Group', combo(CMD, 'G')],
    ['Ungroup', combo(SHIFT, CMD, 'G')],
  ],
  view: [
    ['Type into the selected text', 'Enter'],
    ['Open the Text pane', 'T'],
    ['Pan around', 'Space + drag'],
    ['Closer', combo(CMD, '+')],
    ['Further away', combo(CMD, '−')],
    ['Whole page in view', combo(CMD, '0')],
    ['Rulers on or off', combo(SHIFT, CMD, 'R')],
  ],
}

export function KeysModal({ onClose }: ModalProps) {
  const [tab, setTab] = useState<KeyTab>('everyday')
  return (
    <Modal open onClose={onClose} title="Keys that save time" width={440}>
      <ChoiceRow<KeyTab>
        value={tab}
        onChange={setTab}
        options={[{ value: 'everyday', label: 'Everyday' }, { value: 'layers', label: 'Layers' }, { value: 'view', label: 'Text and view' }]}
      />
      <ul className="mt-3 flex flex-col gap-1">
        {KEYS[tab].map(([label, keys]) => (
          <li key={label} className="flex items-center gap-3 rounded-lg px-2.5 py-1.5 odd:bg-surface-2 text-[13px]">
            <span className="flex-1 text-ink-2">{label}</span>
            <kbd className="font-mono text-[12px] text-ink tracking-wide">{keys}</kbd>
          </li>
        ))}
      </ul>
    </Modal>
  )
}

export const slotName = (el: { slot?: string; key?: string }) => el.slot || el.key || ''

function slotsInDesign(): string[] {
  const doc = useEditor.getState().doc
  const names = new Set<string>()
  for (const p of doc?.getSnapshot().pages ?? []) for (const el of p.elements) if (slotName(el)) names.add(slotName(el))
  return [...names].sort()
}

const cleanSlot = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60)

export function SlotModal({ onClose }: ModalProps) {
  const els = useSelected()
  const el = els.length === 1 ? els[0] : null
  const current = el ? slotName(el) : ''
  const [value, setValue] = useState(current)
  const others = slotsInDesign().filter((k) => k !== current)
  const save = () => {
    if (el) updateElement(el.id, { slot: cleanSlot(value) || undefined, key: undefined })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Slot name"
      width={440}
      footer={el ? <><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Save</Button></> : undefined}
    >
      {!el ? (
        <p className="text-[13px] text-muted">Select one element on the page first.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted leading-relaxed">
            A named {el.type === 'image' ? 'photo' : el.type} becomes a slot: copies made from a spreadsheet, the API or an
            assistant can put new content here and leave the rest of the layout alone. Match it to a column heading, like
            <code className="text-ink"> guest_name</code>.
          </p>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="guest_name"
            aria-label="Slot name"
          />
          {value && cleanSlot(value) !== value && <p className="text-[12px] text-muted">Will be saved as <code className="text-ink">{cleanSlot(value) || '(empty)'}</code></p>}
          {others.length > 0 && (
            <div>
              <p className="text-[12px] text-faint mb-1.5">Slots elsewhere in this design</p>
              <div className="flex flex-wrap gap-1.5">
                {others.map((k) => (
                  <button key={k} onClick={() => setValue(k)} className="h-7 px-2.5 rounded-full border border-line-2 text-[12px] font-mono hover:bg-hover">{k}</button>
                ))}
              </div>
            </div>
          )}
          {current && <button className="self-start text-[13px] text-danger hover:underline" onClick={() => { updateElement(el.id, { slot: undefined, key: undefined }); onClose() }}>Not a slot any more</button>}
        </div>
      )}
    </Modal>
  )
}

function normalizeUrl(v: string): string | null {
  const s = v.trim()
  if (!s) return ''
  if (/^(mailto:|tel:)/i.test(s)) return s
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withScheme)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null
    return u.toString()
  } catch {
    return null
  }
}

export function LinkModal({ onClose }: ModalProps) {
  const els = useSelected()
  const el = els.length === 1 ? els[0] : null
  const [value, setValue] = useState(el?.link ?? '')
  const url = normalizeUrl(value)
  const save = () => {
    if (!el || url === null) return
    updateElement(el.id, { link: url || undefined })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Link"
      width={440}
      footer={el ? <><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={url === null} onClick={save}>Save</Button></> : undefined}
    >
      {!el ? (
        <p className="text-[13px] text-muted">Select one element on the page first.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">People can click this element in PDF downloads and when you present.</p>
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            placeholder="example.com, or mailto:hello@example.com"
            aria-label="Link address"
            inputMode="url"
          />
          {url === null && <p className="text-[12px] text-danger">That doesn't look like a web address.</p>}
          {el.link && <button className="self-start text-[13px] text-danger hover:underline" onClick={() => { updateElement(el.id, { link: undefined }); onClose() }}>Remove link</button>}
        </div>
      )}
    </Modal>
  )
}

export function TemplateModal({ onClose }: ModalProps) {
  const designId = useEditor((s) => s.designId)
  const isAdmin = useAuth((s) => s.user?.is_admin)
  const [loaded, setLoaded] = useState(false)
  const [isTemplate, setIsTemplate] = useState(false)
  const [category, setCategory] = useState('')
  const [order, setOrder] = useState(0)
  const [cats, setCats] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!designId) return
    Promise.all([
      api<DesignMeta>(`/api/designs/${designId}`).catch(() => null),
      api<{ categories: string[] }>('/api/templates').catch(() => ({ categories: [] as string[] })),
    ]).then(([d, t]) => {
      if (d) {
        setIsTemplate(d.is_template)
        setCategory(d.template_category ?? '')
        setOrder(d.template_order ?? 0)
      }
      setCats(t.categories)
      setLoaded(true)
    })
  }, [designId])

  const save = async (value: boolean) => {
    setBusy(true)
    setMsg('')
    try {
      await api(`/api/designs/${designId}/template`, { method: 'PUT', json: { is_template: value, category: category.trim(), order } })
      setIsTemplate(value)
      setMsg(value ? 'Saved. It now shows in Templates for everyone.' : 'Removed from Templates.')
    } catch (e) {
      setMsg((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} title="Save as template" width={440}>
      {!isAdmin ? (
        <p className="text-[13px] text-muted">Only admins can publish templates.</p>
      ) : !loaded ? (
        <div className="py-6 flex justify-center"><Spinner /></div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-muted">Templates appear for everyone on this server. Later edits to this design show up in the template too.</p>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            Category
            <Input list="ka-template-cats" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Social, Presentations" maxLength={60} />
            <datalist id="ka-template-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-medium">
            Order
            <Input type="number" value={order} onChange={(e) => setOrder(Math.round(Number(e.target.value) || 0))} />
            <span className="text-[12px] text-muted font-normal">Lower numbers show first within the category.</span>
          </label>
          {msg && <p className="text-[13px] text-ink-2" role="status">{msg}</p>}
          <div className="flex justify-end gap-2 pt-1">
            {isTemplate && <Button variant="danger" className="mr-auto" disabled={busy} onClick={() => void save(false)}>Remove from templates</Button>}
            <Button variant="primary" disabled={busy} onClick={() => void save(true)}>{isTemplate ? 'Save template' : 'Publish'}</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
