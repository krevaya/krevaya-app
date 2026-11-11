import type { DesignDoc } from '@/doc/schema'

// Present mode and the presenter window talk over a BroadcastChannel.

export type ShowState = { index: number; autoplay: boolean; startedAt: number; title: string }

export type ToPresenter =
  | { type: 'doc'; doc: DesignDoc }
  | { type: 'state'; state: ShowState }
  | { type: 'ended' }

export type ToShow =
  | { type: 'hello' }
  | { type: 'goto'; index: number }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'autoplay'; on: boolean }
  | { type: 'exit' }

export function showChannel(designId: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null
  return new BroadcastChannel(`krevaya-present-${designId}`)
}

export function openPresenterWindow(designId: string) {
  return window.open(`/presenter/${encodeURIComponent(designId)}`, `krevaya-presenter-${designId}`, 'popup,width=1180,height=760')
}

export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
