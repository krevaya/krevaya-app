import { useEffect, useState } from 'react'
import type { DesignDoc } from '@/doc/schema'
import { loadTemplateDoc, type Template } from './templates'

// Built-in templates have no owner, so nobody can upload a thumbnail for them.
// When the server has none we draw one here and keep it in a small IndexedDB
// store of its own (separate from guest designs), keyed by template version.

const DB = 'krevaya-app-thumbs'
const STORE = 'thumbs'
const memory = new Map<string, Promise<string>>()
let dbp: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (!dbp) {
    dbp = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1)
        req.onupgradeneeded = () => req.result.createObjectStore(STORE)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return dbp
}

async function cached(key: string): Promise<string | undefined> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    const req = db.transaction(STORE).objectStore(STORE).get(key)
    req.onsuccess = () => resolve(req.result as string | undefined)
    req.onerror = () => resolve(undefined)
  })
}

async function store(key: string, value: string) {
  const db = await openDb()
  if (!db) return
  db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
}

// one render at a time keeps the page responsive while a grid fills in
let queue: Promise<unknown> = Promise.resolve()

async function render(t: Template): Promise<string> {
  const [doc, { renderPageCanvas }, { ensureFontCatalog }] = await Promise.all([
    loadTemplateDoc(t.id, t.updated_at),
    import('@/export/raster'),
    import('@/editor/fonts'),
  ])
  const page = doc.pages[0]
  if (!page) return ''
  await ensureFontCatalog()
  const scale = Math.min(1, 480 / Math.max(page.width, page.height))
  const canvas = await renderPageCanvas(page, scale)
  return canvas.toDataURL('image/jpeg', 0.86)
}

export function templateThumb(t: Template): Promise<string> {
  if (t.thumbnail) return Promise.resolve(t.thumbnail)
  const key = `${t.id}:${t.updated_at}`
  let p = memory.get(key)
  if (!p) {
    p = (async () => {
      const hit = await cached(key)
      if (hit) return hit
      const job = queue.then(() => render(t))
      queue = job.catch(() => {})
      const url = await job
      if (url) void store(key, url)
      return url
    })()
    p.catch(() => memory.delete(key))
    memory.set(key, p)
  }
  return p
}

/** The template's thumbnail, drawing it on first use. Empty string until ready. */
export function useTemplateThumb(t: Template): string {
  const [url, setUrl] = useState(t.thumbnail)
  useEffect(() => {
    let live = true
    setUrl(t.thumbnail)
    if (!t.thumbnail) {
      templateThumb(t).then((u) => live && setUrl(u)).catch(() => {})
    }
    return () => {
      live = false
    }
  }, [t.id, t.thumbnail, t.updated_at])
  return url
}

// Designs made by fill, bulk create or an assistant have no thumbnail until
// someone opens them. Draw the first page here and save it, like the editor does.
const designMemory = new Map<string, Promise<string>>()

async function renderDesign(id: string): Promise<string> {
  const [{ api }, { renderThumbnail }, { ensureFontCatalog }] = await Promise.all([
    import('@/api/client'),
    import('@/export/raster'),
    import('@/editor/fonts'),
  ])
  const d = await api<{ doc: DesignDoc }>(`/api/designs/${id}`)
  const page = d.doc?.pages[0]
  if (!page) return ''
  await ensureFontCatalog()
  const url = await renderThumbnail(page)
  const form = new FormData()
  form.append('file', await (await fetch(url)).blob(), 'thumb.png')
  await api(`/api/designs/${id}/thumbnail`, { method: 'POST', body: form }).catch(() => {})
  return url
}

/** A saved design's thumbnail, drawing and saving one when it has none. */
export function useDesignThumb(id: string, thumbnail: string, skip: boolean): string {
  const [url, setUrl] = useState(thumbnail)
  useEffect(() => {
    let live = true
    setUrl(thumbnail)
    if (!thumbnail && !skip) {
      let p = designMemory.get(id)
      if (!p) {
        const job = queue.then(() => renderDesign(id))
        queue = job.catch(() => {})
        p = job
        p.catch(() => designMemory.delete(id))
        designMemory.set(id, p)
      }
      p.then((u) => live && setUrl(u)).catch(() => {})
    }
    return () => {
      live = false
    }
  }, [id, thumbnail, skip])
  return url
}
