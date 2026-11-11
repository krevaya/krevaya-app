import { Icon } from '@/components/icons'
import { create } from 'zustand'
import { Spinner } from '@/components/ui/kit'

// Small status line over the canvas for drops, pastes and long photo jobs.

type Msg = { id: number; text: string; busy?: boolean; progress?: number }

const useToasts = create<{ list: Msg[] }>(() => ({ list: [] }))
let next = 1

export function toast(text: string, ms = 4500) {
  const id = next++
  useToasts.setState((s) => ({ list: [...s.list, { id, text }] }))
  setTimeout(() => dismiss(id), ms)
  return id
}

/** A message that stays until it's updated to done or dismissed. */
export function busyToast(text: string) {
  const id = next++
  useToasts.setState((s) => ({ list: [...s.list, { id, text, busy: true }] }))
  return {
    update: (patch: { text?: string; progress?: number }) =>
      useToasts.setState((s) => ({ list: s.list.map((m) => (m.id === id ? { ...m, ...patch } : m)) })),
    done: (text?: string) => {
      if (!text) return dismiss(id)
      useToasts.setState((s) => ({ list: s.list.map((m) => (m.id === id ? { id, text } : m)) }))
      setTimeout(() => dismiss(id), 4500)
    },
  }
}

function dismiss(id: number) {
  useToasts.setState((s) => ({ list: s.list.filter((m) => m.id !== id) }))
}

export function Toasts() {
  const list = useToasts((s) => s.list)
  if (!list.length) return null
  return (
    <div className="absolute left-0 right-0 bottom-16 z-20 flex flex-col items-center gap-2 pointer-events-none" role="status" aria-live="polite">
      {list.map((m) => (
        <div key={m.id} className="pointer-events-auto flex items-center gap-2.5 max-w-[420px] min-h-10 pl-3.5 pr-1.5 py-1.5 rounded-control bg-ink text-surface text-[13px] shadow-pop">
          {m.busy && <Spinner className="border-white/30 border-t-white shrink-0" />}
          <span className="leading-snug">{m.text}</span>
          {m.progress !== undefined && <span className="tabular-nums opacity-70">{Math.round(m.progress * 100)}%</span>}
          <button className="h-7 w-7 rounded-lg hover:bg-white/10 flex items-center justify-center shrink-0" onClick={() => dismiss(m.id)} aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
