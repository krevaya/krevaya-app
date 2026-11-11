import { api, upload } from '@/api/client'
import { DocStore } from '@/doc/store'
import { listGuestDesigns, localBlob } from '@/persistence/local'
import { docFromState } from './create'

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/**
 * Move every design made as a guest into the signed-in account. Photos uploaded
 * as a guest live in this browser, so they're uploaded first and the designs
 * are pointed at the server copies.
 */
export async function importGuestDesigns(): Promise<number> {
  const designs = await listGuestDesigns()
  const uploaded = new Map<string, string>()
  const payload = []
  for (const d of designs) {
    const doc = docFromState(d.state)
    const srcs = new Set<string>()
    for (const p of doc.pages) {
      if (p.background.type === 'image') srcs.add(p.background.src)
      for (const el of p.elements) if (el.type === 'image') srcs.add(el.src)
    }
    for (const t of doc.settings.audio ?? []) if (t.src) srcs.add(t.src)
    for (const src of srcs) {
      if (!src.startsWith('local:') || uploaded.has(src)) continue
      const blob = await localBlob(src)
      if (!blob) continue
      const asset = await upload<{ url: string }>('/api/assets', blob, {}, 'upload')
      uploaded.set(src, asset.url)
    }
    for (const p of doc.pages) {
      if (p.background.type === 'image' && uploaded.has(p.background.src)) p.background = { ...p.background, src: uploaded.get(p.background.src)! }
      for (const el of p.elements) if (el.type === 'image' && uploaded.has(el.src)) el.src = uploaded.get(el.src)!
    }
    for (const t of doc.settings.audio ?? []) if (t.src && uploaded.has(t.src)) t.src = uploaded.get(t.src)
    const store = new DocStore()
    store.load(doc)
    payload.push({ title: d.title, state: toBase64(store.encode()), thumbnail: d.thumbnail || undefined })
    store.destroy()
  }
  if (payload.length) await api('/api/designs/import-guest', { method: 'POST', json: { designs: payload } })
  return payload.length
}
