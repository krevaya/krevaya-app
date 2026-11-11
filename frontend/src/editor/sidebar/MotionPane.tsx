import { Icon } from '@/components/icons'
import { useEffect, useState, type ReactNode } from 'react'
import { Button, cx, ChoiceRow, SectionLabel, Slider } from '@/components/ui/kit'
import type { AnimRef, AnimPhase, DesignElement, Page } from '@/doc/schema'
import { playPreview, stopPreview, usePreviewing } from '@/motion/preview'
import { MotionSwatch, TransitionSwatch } from '@/motion/Swatch'
import {
  animDuration, ENTRANCES, EXITS, FAMILIES, LOOPS, PAGE_CHANGES, pageChange, pageRunTime, transitionDuration,
} from '@/motion/timeline'
import { canEdit, useEditor } from '@/stores/editor'
import { updateElements } from '../actions'
import { useDoc, usePage, useSelected } from '../hooks'

const PHASES: Array<{ value: AnimPhase; label: string }> = [
  { value: 'enter', label: 'Enter' },
  { value: 'exit', label: 'Exit' },
  { value: 'emphasis', label: 'Emphasis' },
]

const secs = (ms: number) => Math.round(ms / 100) / 10

function setAnim(els: DesignElement[], slot: AnimPhase, ref: AnimRef | null) {
  updateElements(els.map((el) => {
    const anim = { ...el.anim }
    if (ref) anim[slot] = ref
    else delete anim[slot]
    return [el.id, { anim: Object.keys(anim).length ? anim : undefined }]
  }))
}

/** Preview just this slot on these elements, around the moment it plays. */
function previewSlot(page: Page, ids: string[], slot: AnimPhase, ref: AnimRef) {
  const dur = animDuration(slot, ref)
  const pageMs = pageRunTime(page)
  const only = new Set(ids)
  if (slot === 'enter') playPreview(page.id, { from: 0, to: (ref.delay ?? 0) + dur + 400, only })
  else if (slot === 'exit') playPreview(page.id, { from: Math.max(0, pageMs - (ref.delay ?? 0) - dur - 500), to: pageMs + 300, only })
  else {
    // emphasis waits for the enter animation, so start from there
    const el = page.elements.find((e) => only.has(e.id))
    const enter = el?.anim?.enter
    const start = enter ? (enter.delay ?? 0) + animDuration('enter', enter) : 0
    playPreview(page.id, { from: start, to: Math.min(pageMs, start + (ref.delay ?? 0) + dur * 2.5), only })
  }
}

const STAGGER = 110

/**
 * Everything worth animating, nearest the page center first so the entrance
 * ripples outwards. Locked items join in, unless they're a backdrop filling the page.
 */
function rippleOrder(page: Page): DesignElement[] {
  const cx = page.width / 2
  const cy = page.height / 2
  const backdrop = (e: DesignElement) => e.locked && e.width * e.height >= page.width * page.height * 0.9
  const dist = (e: DesignElement) => Math.hypot(e.x + e.width / 2 - cx, e.y + e.height / 2 - cy)
  return page.elements.filter((e) => !e.hidden && !backdrop(e)).sort((a, b) => dist(a) - dist(b))
}

function Tile({ label, active, onClick, children, onHover, wide }: {
  label: string
  active: boolean
  onClick: () => void
  children: ReactNode
  onHover: (on: boolean) => void
  /** swatch and label side by side, for the two-column lists */
  wide?: boolean
}) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-pressed={active}
      className={cx(
        'rounded-tile border transition',
        wide ? 'p-1.5 flex items-center gap-2 text-left' : 'p-1.5 pb-1 flex flex-col items-center gap-1',
        active ? 'border-accent bg-accent-wash text-accent' : 'border-line bg-surface-2 hover:border-accent-line text-ink-2',
      )}
    >
      {children}
      <span className={cx('text-[11.5px] leading-tight max-w-full', wide ? 'min-w-0' : 'truncate')}>{label}</span>
    </button>
  )
}

function NoneTile({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <Tile label="None" active={active} onClick={onClick} onHover={() => {}}>
      <div className="w-[72px] h-[48px] rounded-[8px] bg-surface flex items-center justify-center text-faint"><Icon name="ban" size={18} /></div>
    </Tile>
  )
}

function PlayButton({ page }: { page: Page }) {
  const playing = usePreviewing()
  const any = page.elements.some((e) => e.anim)
  return (
    <Button
      variant="primary"
      className="w-full rounded-full"
      disabled={!any && !playing}
      onClick={() => (playing ? stopPreview() : playPreview(page.id))}
      title={any ? undefined : 'Give something on this page a move first'}
    >
      {playing ? <><Icon name="stop" size={14} /> Stop</> : <><Icon name="play" size={15} /> Play page</>}
    </Button>
  )
}

export default function MotionPane() {
  const page = usePage()
  const els = useSelected()
  const editable = canEdit(useEditor((s) => s.role))
  useEffect(() => () => stopPreview(), [])
  useEffect(() => stopPreview(), [page?.id])
  if (!page) return null
  return (
    <div className="flex flex-col">
      <PlayButton page={page} />
      {els.length ? <ElementAnim page={page} els={els} editable={editable} /> : <PageAnim page={page} editable={editable} />}
    </div>
  )
}

function ElementAnim({ page, els, editable }: { page: Page; els: DesignElement[]; editable: boolean }) {
  const [slot, setSlot] = useState<AnimPhase>('enter')
  // exits have their own list, with the same names as the entrances
  const [hover, setHover] = useState<string | null>(null)
  const first = els[0]
  const current = first.anim?.[slot]
  const mixed = els.some((e) => e.anim?.[slot]?.name !== current?.name)
  const defs = slot === 'emphasis' ? LOOPS : slot === 'exit' ? EXITS : ENTRANCES
  const ids = els.map((e) => e.id)

  const choose = (name: string | null) => {
    if (!editable) return
    if (!name) return setAnim(els, slot, null)
    const ref: AnimRef = { name }
    if (current?.duration !== undefined) ref.duration = current.duration
    if (current?.delay !== undefined) ref.delay = current.delay
    setAnim(els, slot, ref)
    // the page snapshot is stale until the next render, so preview with the new ref patched in
    const patched = { ...page, elements: page.elements.map((e) => (ids.includes(e.id) ? { ...e, anim: { ...e.anim, [slot]: ref } } : e)) }
    requestAnimationFrame(() => previewSlot(patched, ids, slot, ref))
  }

  const patch = (p: Partial<AnimRef>) => {
    if (!current || !editable) return
    setAnim(els, slot, { ...current, ...p })
  }

  const applyToPage = () => {
    if (!current) return
    const others = page.elements.filter((e) => !e.locked)
    setAnim(others, slot, current)
  }

  const counts = (s: AnimPhase) => els.filter((e) => e.anim?.[s]).length

  return (
    <div className="flex flex-col">
      <ChoiceRow
        className="mt-4"
        value={slot}
        onChange={setSlot}
        options={PHASES.map((s) => ({
          value: s.value,
          label: <>{s.label}{counts(s.value) > 0 && <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="set" />}</>,
        }))}
      />
      <p className="text-[12px] text-muted mt-2 leading-snug">
        {slot === 'enter' && 'How it arrives when the page appears.'}
        {slot === 'exit' && 'How it leaves before the page ends. Exits play when a page has a set duration, like on autoplay or in videos.'}
        {slot === 'emphasis' && 'A gentle loop while it stays on screen.'}
      </p>

      {current && (
        <div className="mt-4 flex flex-col gap-3 rounded-card border border-line p-3">
          <Slider
            label={slot === 'emphasis' ? 'Loop length (s)' : 'Duration (s)'}
            min={0.1}
            max={slot === 'emphasis' ? 6 : 5}
            step={0.1}
            value={secs(animDuration(slot, current))}
            onChange={(v) => patch({ duration: Math.round(v * 1000) })}
          />
          <Slider
            label={slot === 'exit' ? 'Ends before page end (s)' : 'Delay (s)'}
            min={0}
            max={10}
            step={0.1}
            value={secs(current.delay ?? 0)}
            onChange={(v) => patch({ delay: Math.round(v * 1000) || undefined })}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => previewSlot(page, ids, slot, current)}>
              <Icon name="play" size={13} /> Preview
            </Button>
            <Button size="sm" variant="danger" onClick={() => choose(null)} disabled={!editable}>
              <Icon name="trash" size={13} /> Remove
            </Button>
          </div>
          <Button size="sm" variant="soft" onClick={applyToPage} disabled={!editable}>
            Use on everything on this page
          </Button>
        </div>
      )}

      <SectionLabel>{mixed ? 'Animations (mixed selection)' : 'Animations'}</SectionLabel>
      <div className="grid grid-cols-3 gap-2">
        <NoneTile active={!current && !mixed} onClick={() => choose(null)} />
        {defs.map((d) => (
          <Tile
            key={d.id}
            label={d.label}
            active={!mixed && current?.name === d.id}
            onClick={() => choose(d.id)}
            onHover={(on) => setHover((h) => (on ? d.id : h === d.id ? null : h))}
          >
            <MotionSwatch phase={slot} name={d.id} active={hover === d.id} />
          </Tile>
        ))}
      </div>
      {els.some((e) => e.anim) && (
        <Button size="sm" variant="ghost" className="mt-4 self-start" disabled={!editable} onClick={() => updateElements(els.map((e) => [e.id, { anim: undefined }]))}>
          Clear motion from {els.length > 1 ? 'these elements' : 'this element'}
        </Button>
      )}
    </div>
  )
}

function PageAnim({ page, editable }: { page: Page; editable: boolean }) {
  const doc = useDoc()
  const [hover, setHover] = useState<string | null>(null)
  const index = doc.pages.findIndex((p) => p.id === page.id)
  const tr = page.transition && pageChange(page.transition.name) ? page.transition : null
  const store = useEditor((s) => s.doc)
  const setPage = (patch: Partial<Page>) => editable && store?.updatePage(page.id, patch)

  const pickTransition = (name: string | null) => {
    if (!name) return setPage({ transition: undefined })
    const def = pageChange(name)!
    setPage({ transition: { name, duration: tr?.duration ?? def.ms } })
  }

  const animateAll = (name: string) => {
    if (!editable) return
    const order = rippleOrder(page)
    updateElements(order.map((el, i) => [el.id, { anim: { ...el.anim, enter: { name, delay: i * STAGGER } } }]))
    requestAnimationFrame(() => playPreview(page.id, { from: 0, to: order.length * STAGGER + 1400 }))
  }

  return (
    <div className="flex flex-col">
      <p className="text-[12px] text-muted mt-3 leading-snug">Select something on the page to animate it, or set up the page itself here.</p>

      <SectionLabel>Page {index + 1} duration</SectionLabel>
      <Slider
        label="Seconds"
        min={0.5}
        max={60}
        step={0.5}
        value={secs(pageRunTime(page))}
        onChange={(v) => setPage({ duration: Math.round(Math.max(0.5, v) * 1000) })}
      />

      <SectionLabel action={tr && editable ? (
        <span className="flex gap-3">
          <button className="text-[12px] text-accent hover:underline" onClick={() => doc.pages.forEach((p, i) => i > 0 && store?.updatePage(p.id, { transition: tr }))}>
            Use everywhere
          </button>
          <button className="text-[12px] text-muted hover:text-ink hover:underline" onClick={() => pickTransition(null)}>
            Remove
          </button>
        </span>
      ) : undefined}>
        Page change
      </SectionLabel>
      <p className="text-[12px] text-muted -mt-1 mb-2">
        {index === 0 ? 'Page 1 opens the show, so this only plays once another page sits before it.' : 'How the show moves here from the page before.'}
      </p>
      {FAMILIES.map((fam) => (
        <div key={fam} className="mb-2">
          <p className="text-[11.5px] font-medium text-muted mb-1.5">{fam}</p>
          <div className="grid grid-cols-2 gap-2">
            {PAGE_CHANGES.filter((d) => d.family === fam).map((d) => (
              <Tile key={d.id} wide label={d.label} active={tr?.name === d.id} onClick={() => pickTransition(d.id)} onHover={(on) => setHover((h) => (on ? `t:${d.id}` : h === `t:${d.id}` ? null : h))}>
                <div className="w-[54px] h-[36px] shrink-0">
                  <div className="origin-top-left scale-75">
                    <TransitionSwatch name={d.id} active={hover === `t:${d.id}`} />
                  </div>
                </div>
              </Tile>
            ))}
          </div>
        </div>
      ))}
      {tr && (
        <div className="mt-3">
          <Slider
            label="Transition length (s)"
            min={0.2}
            max={3}
            step={0.1}
            value={secs(transitionDuration(page) || tr.duration)}
            onChange={(v) => setPage({ transition: { ...tr, duration: Math.round(v * 1000) } })}
          />
        </div>
      )}

      <SectionLabel>Animate everything on this page</SectionLabel>
      <p className="text-[12px] text-muted -mt-1 mb-2">One entrance for everything, rippling out from the middle of the page.</p>
      <div className="grid grid-cols-3 gap-2">
        {ENTRANCES.slice(0, 12).map((d) => (
          <Tile key={d.id} label={d.label} active={false} onClick={() => animateAll(d.id)} onHover={(on) => setHover((h) => (on ? `a:${d.id}` : h === `a:${d.id}` ? null : h))}>
            <MotionSwatch phase="enter" name={d.id} active={hover === `a:${d.id}`} />
          </Tile>
        ))}
      </div>
      {page.elements.some((e) => e.anim) && (
        <Button size="sm" variant="ghost" className="mt-4 self-start" disabled={!editable} onClick={() => updateElements(page.elements.filter((e) => e.anim).map((e) => [e.id, { anim: undefined }]))}>
          Clear motion from this page
        </Button>
      )}
    </div>
  )
}
