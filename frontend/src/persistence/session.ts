import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { api, ApiError, shareParams, type DesignMeta } from '@/api/client'
import { DocStore } from '@/doc/store'
import { renderThumbnail } from '@/export/raster'
import { useEditor, type Role } from '@/stores/editor'
import { getGuestDesign, saveGuestState, updateGuestMeta } from './local'

export type Session = {
  doc: DocStore
  provider: WebsocketProvider | null
  meta: { id: string; title: string; role: Role; guest: boolean }
  dispose: () => void
}

const THUMB_DELAY = 2500

function debounce(fn: () => void, ms: number) {
  let t: ReturnType<typeof setTimeout> | null = null
  const run = () => {
    if (t) clearTimeout(t)
    t = setTimeout(() => {
      t = null
      fn()
    }, ms)
  }
  run.flush = () => {
    if (t) {
      clearTimeout(t)
      t = null
      fn()
    }
  }
  return run
}

export async function openGuest(id: string): Promise<Session> {
  const row = await getGuestDesign(id)
  if (!row) throw new Error('This guest design was made on another device or browser, so it isn\'t here')
  const doc = new DocStore()
  Y.applyUpdate(doc.ydoc, row.state, 'load')
  doc.undo.clear()
  const set = useEditor.getState().set
  const save = debounce(async () => {
    set({ save: 'saving' })
    await saveGuestState(id, doc)
    set({ save: 'local' })
  }, 250)
  const thumb = debounce(async () => {
    const page = doc.getSnapshot().pages[0]
    if (page) await updateGuestMeta(id, { thumbnail: await renderThumbnail(page) })
  }, THUMB_DELAY)
  const onUpdate = (_u: Uint8Array, origin: unknown) => {
    if (origin === 'load') return
    save()
    thumb()
  }
  doc.ydoc.on('update', onUpdate)
  if (!row.thumbnail) thumb()
  const flush = () => save.flush()
  // IndexedDB writes are async, so start the save as soon as the tab is hidden
  // (switching away, closing, navigating) rather than waiting for unload.
  const onHide = () => document.visibilityState === 'hidden' && flush()
  window.addEventListener('beforeunload', flush)
  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', onHide)
  return {
    doc,
    provider: null,
    meta: { id, title: row.title, role: 'owner', guest: true },
    dispose: () => {
      save.flush()
      thumb.flush()
      window.removeEventListener('beforeunload', flush)
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      doc.ydoc.off('update', onUpdate)
      doc.destroy()
    },
  }
}

export async function openRemote(id: string): Promise<Session> {
  const meta = await api<DesignMeta & { role: Role }>(`/api/designs/${id}`)
  const q = shareParams()
  const state = await api<ArrayBuffer>(`/api/designs/${id}/state${q ? `?${q}` : ''}`)
  const doc = new DocStore()
  Y.applyUpdate(doc.ydoc, new Uint8Array(state), 'load')
  doc.undo.clear()
  const set = useEditor.getState().set
  const canEdit = meta.role === 'owner' || meta.role === 'edit'

  const wsBase = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/designs`
  const params: Record<string, string> = {}
  if (q) params.share = decodeURIComponent(q.slice(6))
  const provider = new WebsocketProvider(wsBase, id, doc.ydoc, { params, maxBackoffTime: 8000 })

  function lockOut() {
    provider.shouldConnect = false
    provider.disconnect()
    pending = []
    set({ save: 'refused', role: 'view', selection: [], editingId: null, panel: null })
  }

  // If the socket is down, edits still reach the server over plain HTTP.
  let pending: Uint8Array[] = []
  const pushHttp = debounce(async () => {
    if (!pending.length || provider.wsconnected) {
      pending = []
      return
    }
    const update = Y.mergeUpdates(pending)
    pending = []
    set({ save: 'saving' })
    try {
      await api(`/api/designs/${id}/state${q ? `?${q}` : ''}`, { method: 'POST', body: update as BodyInit, headers: { 'content-type': 'application/octet-stream' } })
      set({ save: 'saved' })
    } catch (e) {
      set({ save: 'error' })
      // keep it: later updates build on this one, and the server can't apply them without it
      pending.unshift(update)
      const refused = e instanceof ApiError && e.status >= 400 && e.status < 500 && e.status !== 429
      if (refused && (e.status === 403 || e.status === 404)) lockOut()
      else if (!refused) setTimeout(() => pushHttp(), 4000)
    }
  }, 800)

  let settle: ReturnType<typeof setTimeout> | null = null
  const thumb = debounce(async () => {
    const page = doc.getSnapshot().pages[0]
    if (!page || !canEdit) return
    try {
      const dataUrl = await renderThumbnail(page)
      const blob = await (await fetch(dataUrl)).blob()
      const form = new FormData()
      form.append('file', blob, 'thumb.png')
      await api(`/api/designs/${id}/thumbnail${q ? `?${q}` : ''}`, { method: 'POST', body: form })
    } catch {
      // a missing thumbnail isn't worth bothering anyone about
    }
  }, THUMB_DELAY * 2)

  const onUpdate = (update: Uint8Array, origin: unknown) => {
    if (origin === provider || origin === 'load') return
    if (!canEdit) return
    if (provider.wsconnected) {
      set({ save: 'saving' })
      if (settle) clearTimeout(settle)
      settle = setTimeout(() => set({ save: 'saved' }), 900)
    } else {
      pending.push(update)
      pushHttp()
    }
    thumb()
  }
  doc.ydoc.on('update', onUpdate)

  // The server closes with 4403 when we may no longer see or edit this design,
  // e.g. the share link was turned off. Stop retrying and say so.
  const onClose = (event: CloseEvent | null) => {
    if (event?.code === 4403) lockOut()
  }
  provider.on('connection-close', onClose)

  const onStatus = ({ status }: { status: string }) => {
    if (status === 'connected') set({ save: 'saved' })
    else if (status === 'disconnected') set({ save: navigator.onLine ? 'saved' : 'offline' })
  }
  provider.on('status', onStatus)
  const onAwareness = () => set({ peers: Math.max(0, provider.awareness.getStates().size - 1) })
  provider.awareness.on('change', onAwareness)

  return {
    doc,
    provider,
    meta: { id, title: meta.title, role: meta.role, guest: false },
    dispose: () => {
      pushHttp.flush()
      thumb.flush()
      doc.ydoc.off('update', onUpdate)
      provider.awareness.off('change', onAwareness)
      provider.off('status', onStatus)
      provider.off('connection-close', onClose)
      provider.destroy()
      doc.destroy()
    },
  }
}
