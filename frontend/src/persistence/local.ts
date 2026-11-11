import * as Y from 'yjs'
import type { DesignDoc } from '@/doc/schema'
import { DocStore } from '@/doc/store'
import { idb } from '@/lib/idb'
import { uid } from '@/lib/id'

// Guests keep everything in this browser: the design state, a thumbnail and any
// photos they upload (as blobs, referenced from the design as "local:<id>").

export type GuestDesign = {
  id: string
  title: string
  width: number
  height: number
  pageCount: number
  thumbnail: string
  state: Uint8Array
  createdAt: number
  updatedAt: number
  deletedAt?: number | null
}

export async function listGuestDesigns(trash = false): Promise<GuestDesign[]> {
  const all = await idb.all<GuestDesign>('designs')
  return all.filter((d) => (trash ? d.deletedAt : !d.deletedAt)).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getGuestDesign(id: string) {
  return idb.get<GuestDesign>('designs', id)
}

export async function newLocalDesign(title: string, doc: DesignDoc): Promise<string> {
  const store = new DocStore()
  store.load(doc)
  const id = uid(16)
  const first = doc.pages[0]
  await idb.put<GuestDesign>('designs', {
    id, title, width: first?.width ?? 1080, height: first?.height ?? 1080, pageCount: doc.pages.length,
    thumbnail: '', state: store.encode(), createdAt: Date.now(), updatedAt: Date.now(),
  })
  store.destroy()
  return id
}

export async function saveGuestState(id: string, store: DocStore, patch: Partial<GuestDesign> = {}) {
  const cur = await getGuestDesign(id)
  if (!cur) return
  const snap = store.getSnapshot()
  await idb.put<GuestDesign>('designs', {
    ...cur,
    ...patch,
    state: Y.encodeStateAsUpdate(store.ydoc),
    width: snap.pages[0]?.width ?? cur.width,
    height: snap.pages[0]?.height ?? cur.height,
    pageCount: snap.pages.length,
    updatedAt: Date.now(),
  })
}

export async function updateGuestMeta(id: string, patch: Partial<GuestDesign>) {
  const cur = await getGuestDesign(id)
  if (cur) await idb.put<GuestDesign>('designs', { ...cur, ...patch })
}

export async function deleteGuestDesign(id: string, permanent = false) {
  if (permanent) await idb.del('designs', id)
  else await updateGuestMeta(id, { deletedAt: Date.now() })
}

export async function duplicateGuestDesign(id: string) {
  const cur = await getGuestDesign(id)
  if (!cur) return
  const copy = { ...cur, id: uid(16), title: `${cur.title} (copy)`, createdAt: Date.now(), updatedAt: Date.now(), deletedAt: null }
  await idb.put('designs', copy)
  return copy.id
}

// Local blobs

type BlobRow = { id: string; blob: Blob; name: string; type: string; width?: number; height?: number; createdAt: number }

const urls = new Map<string, string>()

export async function putLocalBlob(blob: Blob, name: string, size?: { width: number; height: number }): Promise<string> {
  const id = uid(16)
  await idb.put<BlobRow>('blobs', { id, blob, name, type: blob.type, ...size, createdAt: Date.now() })
  return `local:${id}`
}

export async function listLocalBlobs(kind: 'image' | 'audio' = 'image') {
  const rows = await idb.all<BlobRow>('blobs')
  return rows.filter((r) => r.type.startsWith(kind)).sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteLocalBlob(id: string) {
  await idb.del('blobs', id)
}

/** Turn "local:<id>" into a blob URL the canvas can draw. */
export async function resolveLocal(src: string): Promise<string> {
  if (!src.startsWith('local:')) return src
  const id = src.slice(6)
  const hit = urls.get(id)
  if (hit) return hit
  const row = await idb.get<BlobRow>('blobs', id)
  if (!row) throw new Error('missing local file')
  const url = URL.createObjectURL(row.blob)
  urls.set(id, url)
  return url
}

export async function localBlob(src: string): Promise<Blob | undefined> {
  if (!src.startsWith('local:')) return
  return (await idb.get<BlobRow>('blobs', src.slice(6)))?.blob
}
