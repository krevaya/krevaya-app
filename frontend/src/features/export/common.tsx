import type { Page } from '@/doc/schema'
import { parsePageList } from '@/export/paper'
import { Button, Input, ChoiceRow } from '@/components/ui/kit'
import { useEditor } from '@/stores/editor'

export type PageMode = 'all' | 'current' | 'custom'

export function loadPrefs<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return { ...fallback, ...JSON.parse(raw) }
  } catch {
    // private mode or bad JSON: defaults are fine
  }
  return fallback
}

export function savePrefs(key: string, value: object) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

export function choosePages(pages: Page[], mode: PageMode, custom: string): Page[] {
  if (mode === 'current') {
    const id = useEditor.getState().pageId
    const p = pages.find((x) => x.id === id) ?? pages[0]
    return p ? [p] : []
  }
  if (mode === 'custom') return parsePageList(custom, pages.length).map((i) => pages[i])
  return pages
}

export function PagePicker({ mode, custom, count, onMode, onCustom }: {
  mode: PageMode
  custom: string
  count: number
  onMode: (m: PageMode) => void
  onCustom: (s: string) => void
}) {
  const picked = mode === 'custom' ? parsePageList(custom, count).length : 0
  return (
    <div className="flex flex-col gap-2">
      <ChoiceRow<PageMode>
        value={mode}
        onChange={onMode}
        options={[
          { value: 'all', label: count > 1 ? `All pages (${count})` : 'All pages' },
          { value: 'current', label: 'Current page' },
          { value: 'custom', label: 'Choose' },
        ]}
      />
      {mode === 'custom' && (
        <div className="flex flex-col gap-1">
          <Input value={custom} onChange={(e) => onCustom(e.target.value)} placeholder={count > 1 ? `e.g. 1-${Math.min(3, count)}, ${count}` : '1'} aria-label="Pages to include" autoFocus />
          <p className="text-[12px] text-muted">
            {picked ? `${picked} of ${count} page${count === 1 ? '' : 's'} selected` : `Type page numbers or ranges, from 1 to ${count}.`}
          </p>
        </div>
      )}
    </div>
  )
}

export function Progress({ fraction, label, onCancel }: { fraction: number; label: string; onCancel: () => void }) {
  return (
    <div className="flex items-center gap-3 w-full" role="status" aria-live="polite">
      <div className="flex-1 min-w-0">
        <div className="flex justify-between text-[12px] text-muted mb-1.5">
          <span className="truncate">{label}</span>
          <span className="tabular-nums">{Math.round(fraction * 100)}%</span>
        </div>
        <div className="h-1.5 rounded-full bg-surface-2 border border-line overflow-hidden">
          <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${Math.max(2, fraction * 100)}%` }} />
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
    </div>
  )
}

export const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'
