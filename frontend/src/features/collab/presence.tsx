import { useEffect } from 'react'
import { create } from 'zustand'
import { cx } from '@/components/ui/kit'
import type { OverlayProps } from '@/editor/canvas/hooks'
import { usePage } from '@/editor/hooks'
import { useAuth } from '@/stores/auth'
import { useEditor } from '@/stores/editor'
import { currentSession } from '@/views/Editor'
import { stageOffset } from './CommentMarkers'
import { guestName } from './comments'

export type Peer = {
  clientId: number
  user: { name: string; color: string }
  cursor: { pageId: string; x: number; y: number } | null
  selection: string[]
}

export const usePresence = create<{ peers: Peer[] }>(() => ({ peers: [] }))

const COLORS = ['#e5487a', '#0f9d8a', '#f08c00', '#3b82f6', '#9b51e0', '#16a34a', '#d9480f', '#0891b2']

function colorFor(seed: string) {
  let h = 0
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) | 0
  return COLORS[Math.abs(h) % COLORS.length]
}

function me(clientId: number) {
  const u = useAuth.getState().user
  const name = u?.name || u?.email.split('@')[0] || guestName() || 'Guest'
  return { name, color: colorFor(u?.id ?? String(clientId)) }
}

/**
 * Publishes our cursor and selection over the y-websocket awareness channel and
 * draws everyone else's. Also feeds the avatar stack in the top bar.
 */
export function LiveCursors({ engine }: OverlayProps) {
  const page = usePage()
  const peers = usePresence((s) => s.peers)

  useEffect(() => {
    const provider = currentSession()?.provider
    if (!provider) return
    const aw = provider.awareness
    aw.setLocalStateField('user', me(aw.clientID))
    aw.setLocalStateField('selection', useEditor.getState().selection)

    const sync = () => {
      const peers: Peer[] = []
      aw.getStates().forEach((st, clientId) => {
        if (clientId === aw.clientID || !st.user) return
        peers.push({ clientId, user: st.user, cursor: st.cursor ?? null, selection: Array.isArray(st.selection) ? st.selection : [] })
      })
      usePresence.setState({ peers })
    }
    aw.on('change', sync)
    sync()

    const offSel = useEditor.subscribe((s, prev) => {
      if (s.selection !== prev.selection) aw.setLocalStateField('selection', s.selection)
    })
    const offUser = useAuth.subscribe((s, prev) => {
      if (s.user !== prev.user) aw.setLocalStateField('user', me(aw.clientID))
    })
    const onName = () => aw.setLocalStateField('user', me(aw.clientID))
    window.addEventListener('ka:guest-name', onName)

    const host = engine.stage.container()
    let last = 0
    let timer: ReturnType<typeof setTimeout> | null = null
    let pending: { pageId: string; x: number; y: number } | null = null
    const flush = () => {
      timer = null
      last = performance.now()
      aw.setLocalStateField('cursor', pending)
    }
    const move = (e: PointerEvent) => {
      const pageId = useEditor.getState().pageId
      if (!pageId) return
      const r = host.getBoundingClientRect()
      const p = engine.toPage(e.clientX - r.left, e.clientY - r.top)
      pending = { pageId, x: Math.round(p.x), y: Math.round(p.y) }
      // about 20 updates a second is plenty for a smooth cursor
      const wait = 50 - (performance.now() - last)
      if (wait <= 0) flush()
      else if (!timer) timer = setTimeout(flush, wait)
    }
    const leave = () => {
      if (timer) clearTimeout(timer)
      timer = null
      pending = null
      aw.setLocalStateField('cursor', null)
    }
    host.addEventListener('pointermove', move)
    host.addEventListener('pointerleave', leave)

    return () => {
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', leave)
      if (timer) clearTimeout(timer)
      aw.off('change', sync)
      offSel()
      offUser()
      window.removeEventListener('ka:guest-name', onName)
      usePresence.setState({ peers: [] })
    }
  }, [engine])

  if (!page || !peers.length) return null
  const off = stageOffset(engine)
  const byId = new Map(page.elements.map((el) => [el.id, el]))

  return (
    <div className="absolute right-0 bottom-0 pointer-events-none z-[4] overflow-hidden" style={off} aria-hidden>
      {peers.map((p) =>
        p.selection.map((id) => {
          const el = byId.get(id)
          if (!el) return null
          const b = engine.screenBox(el)
          return (
            <div
              key={`${p.clientId}:${id}`}
              className="absolute rounded-[2px]"
              style={{
                left: b.x, top: b.y, width: b.width, height: Math.max(b.height, 2),
                transform: `rotate(${el.rotation}deg)`, transformOrigin: 'top left',
                outline: `2px solid ${p.user.color}`, outlineOffset: 1,
              }}
            />
          )
        }),
      )}
      {peers.map((p) => {
        if (!p.cursor || p.cursor.pageId !== page.id) return null
        const at = engine.screenBox({ x: p.cursor.x, y: p.cursor.y, width: 0, height: 0 })
        return (
          <div key={p.clientId} className="absolute transition-[left,top] duration-75 ease-linear" style={{ left: at.x, top: at.y }}>
            <svg width="18" height="20" viewBox="0 0 18 20" className="drop-shadow">
              <path d="M1 1l6.5 17 2.6-7.2L17 8.4z" fill={p.user.color} stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
            </svg>
            <span className="absolute left-4 top-4 px-2 py-0.5 rounded-full text-[11px] font-medium text-white whitespace-nowrap shadow" style={{ background: p.user.color }}>
              {p.user.name}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Small stack of faces for the people in the design right now. */
export function PresenceAvatars({ className }: { className?: string }) {
  const peers = usePresence((s) => s.peers)
  if (!peers.length) return null
  const shown = peers.slice(0, 4)
  return (
    <div className={cx('flex items-center -space-x-1.5', className)} aria-label={`${peers.length} other${peers.length > 1 ? 's' : ''} here`}>
      {shown.map((p) => (
        <span
          key={p.clientId}
          title={p.user.name}
          className="h-7 w-7 rounded-full ring-2 ring-surface text-[11px] font-semibold text-white flex items-center justify-center"
          style={{ background: p.user.color }}
        >
          {p.user.name.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {peers.length > shown.length && (
        <span className="h-7 w-7 rounded-full ring-2 ring-surface bg-surface-2 text-[11px] text-muted flex items-center justify-center">+{peers.length - shown.length}</span>
      )}
    </div>
  )
}
