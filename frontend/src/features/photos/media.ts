import { api, upload } from '@/api/client'
import { newImage } from '@/doc/factory'
import type { ImageElement, Page } from '@/doc/schema'
import { addElement, currentPage, selected, updateElement } from '@/editor/actions'
import { rad } from '@/lib/math'
import { deleteLocalBlob, listLocalBlobs, localBlob, putLocalBlob, resolveLocal } from '@/persistence/local'
import { imageNow, loadImage } from '@/render/assets'
import { useAuth } from '@/stores/auth'
import { useEditor } from '@/stores/editor'
import { busyToast, toast } from './toast'

// Where photos come from and where new ones go. Guests keep files in IndexedDB
// ("local:<id>"); signed-in people upload to /api/assets.

export type Upload = {
  id: string
  src: string
  /** Something an <img> can show right away. */
  thumb: string
  width: number
  height: number
  name: string
  assetId?: string
  local: boolean
}

export type ServerAsset = { id: string; url: string; width: number | null; height: number | null; filename: string; mime: string }

/** What a dragged photo tile carries, as JSON. */
export type PhotoDrag = { src: string; width: number; height: number; assetId?: string; track?: string | null }
export const PHOTO_MIME = 'application/x-krevaya-photo'

export function storesLocally() {
  return useEditor.getState().guest || !useAuth.getState().user
}

const listeners = new Set<() => void>()
export function onUploadsChanged(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
function changed() {
  for (const fn of listeners) fn()
}

export function imageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error("That file isn't an image we can read"))
    img.src = url
  })
}

export async function blobSize(blob: Blob) {
  const url = URL.createObjectURL(blob)
  try {
    return await imageSize(url)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export const isImageFile = (f: File | Blob) => /^image\/(png|jpe?g|webp|gif|svg\+xml|avif|bmp)$/.test(f.type)

/** Save an image where this design keeps its files. */
export async function storeImage(blob: Blob, name: string): Promise<{ src: string; width: number; height: number; assetId?: string }> {
  const size = await blobSize(blob)
  if (storesLocally()) {
    if (!useEditor.getState().guest) throw new Error('Sign in to add your own photos to this design.')
    const src = await putLocalBlob(blob, name, size)
    changed()
    return { src, ...size }
  }
  const a = await upload<ServerAsset>('/api/assets', blob, {}, name)
  changed()
  return { src: a.url, width: a.width || size.width, height: a.height || size.height, assetId: a.id }
}

export async function listUploads(): Promise<Upload[]> {
  if (storesLocally()) {
    const rows = await listLocalBlobs('image')
    return Promise.all(rows.map(async (r) => {
      const src = `local:${r.id}`
      const thumb = await resolveLocal(src)
      let { width = 0, height = 0 } = r
      if (!width || !height) ({ width, height } = await imageSize(thumb).catch(() => ({ width: 1, height: 1 })))
      return { id: r.id, src, thumb, width, height, name: r.name, local: true }
    }))
  }
  const { assets } = await api<{ assets: ServerAsset[] }>('/api/assets?kind=image')
  return assets.map((a) => ({
    id: a.id, src: a.url, thumb: a.url, width: a.width || 1, height: a.height || 1, name: a.filename, assetId: a.id, local: false,
  }))
}

export async function deleteUpload(u: Upload) {
  if (u.local) await deleteLocalBlob(u.id)
  else await api(`/api/assets/${u.id}`, { method: 'DELETE' })
  changed()
}

/** The bytes behind an element's src, for in-browser processing. */
export async function sourceBlob(src: string): Promise<Blob> {
  if (src.startsWith('local:')) {
    const b = await localBlob(src)
    if (!b) throw new Error('This photo is missing from this device.')
    return b
  }
  const res = await fetch(src, { mode: 'cors', credentials: 'same-origin' })
  if (!res.ok) throw new Error("Couldn't download this photo.")
  return res.blob()
}

// Placing photos

function pointIn(el: ImageElement, x: number, y: number) {
  const r = rad(-(el.rotation || 0))
  const dx = x - el.x
  const dy = y - el.y
  const lx = dx * Math.cos(r) - dy * Math.sin(r)
  const ly = dx * Math.sin(r) + dy * Math.cos(r)
  return lx >= 0 && ly >= 0 && lx <= el.width && ly <= el.height
}

/** Topmost image under a page point, if any. */
export function imageAt(page: Page, x: number, y: number): ImageElement | null {
  for (let i = page.elements.length - 1; i >= 0; i--) {
    const el = page.elements[i]
    if (el.hidden || el.locked) continue
    if (el.type === 'image' && pointIn(el, x, y)) return el
  }
  return null
}

/** A photo dropped on an image replaces it when that image is selected or a placeholder. */
export function dropTarget(page: Page, x: number, y: number): ImageElement | null {
  const el = imageAt(page, x, y)
  if (!el) return null
  return el.placeholder || useEditor.getState().selection.includes(el.id) ? el : null
}

export function replaceImage(el: ImageElement, src: string, nw: number, nh: number, assetId?: string) {
  updateElement(el.id, {
    src, naturalWidth: nw, naturalHeight: nh, assetId, crop: undefined, placeholder: undefined,
  } as Partial<ImageElement>)
  useEditor.getState().select([el.id])
}

/** Ask for a file and swap it into this photo, keeping its size, frame and effects. */
export function pickReplacement(el: ImageElement) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'
  input.onchange = async () => {
    const f = input.files?.[0]
    if (!f) return
    if (!isImageFile(f)) return void toast('Only image files can go in a photo.')
    const t = busyToast('Replacing photo…')
    try {
      const s = await storeImage(f, f.name || 'photo.png')
      await loadImage(s.src).catch(() => {})
      replaceImage(el, s.src, s.width, s.height, s.assetId)
      t.done()
    } catch (e) {
      t.done((e as Error).message)
    }
  }
  input.click()
}

export function trackStock(url?: string | null) {
  if (url) void api('/api/stock/photos/track', { method: 'POST', json: { download: url } }).catch(() => {})
}

/**
 * Put a photo on the page. With a drop point it lands there (or fills the image
 * under it); without one it fills a selected placeholder or lands in the middle.
 */
export function placePhoto(p: PhotoDrag, at?: { x: number; y: number }, offset = 0) {
  const page = currentPage()
  if (!page) return
  trackStock(p.track)
  let target: ImageElement | null = null
  if (at) target = dropTarget(page, at.x, at.y)
  else {
    const sel = selected()
    if (sel.length === 1 && sel[0].type === 'image' && sel[0].placeholder) target = sel[0]
  }
  if (target) return replaceImage(target, p.src, p.width, p.height, p.assetId)
  const el = newImage(page, p.src, p.width, p.height, p.assetId ? { assetId: p.assetId } : {})
  if (at) {
    // centered on the drop point, but kept on the page
    el.x = Math.round(Math.max(0, Math.min(page.width - el.width, at.x - el.width / 2 + offset)))
    el.y = Math.round(Math.max(0, Math.min(page.height - el.height, at.y - el.height / 2 + offset)))
  }
  void loadImage(p.src).catch(() => {})
  addElement(el)
}

/** Store dropped or pasted files and put them on the page. */
export async function addFiles(files: File[], at?: { x: number; y: number }): Promise<string | null> {
  const images = files.filter(isImageFile)
  if (!images.length) return files.length ? 'Only image files can go on the page.' : null
  try {
    let i = 0
    for (const f of images) {
      const s = await storeImage(f, f.name || 'pasted-image.png')
      placePhoto({ src: s.src, width: s.width, height: s.height, assetId: s.assetId }, at, i++ * 24)
    }
    return null
  } catch (e) {
    return (e as Error).message
  }
}

// Page background

export function setAsBackground(el: ImageElement) {
  const s = useEditor.getState()
  const page = s.doc?.pageOf(el.id)
  if (!s.doc || !page) return
  s.doc.breakUndo()
  s.doc.transact(() => {
    s.doc!.updatePage(page.id, { background: { type: 'image', src: el.src } })
    s.doc!.remove([el.id])
  })
  s.select([])
}

export async function detachBackground(page: Page) {
  const s = useEditor.getState()
  const bg = page.background
  if (!s.doc || bg.type !== 'image') return
  const img = imageNow(bg.src) ?? (await loadImage(bg.src).catch(() => null))
  const nw = img?.naturalWidth || page.width
  const nh = img?.naturalHeight || page.height
  const el = newImage(page, bg.src, nw, nh, { x: 0, y: 0, width: page.width, height: page.height })
  s.doc.breakUndo()
  s.doc.transact(() => {
    s.doc!.updatePage(page.id, { background: { type: 'solid', color: '#ffffff' } })
    s.doc!.addElements(page.id, [el], 0)
  })
  s.select([el.id])
}
