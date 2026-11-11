import { upload } from '@/api/client'
import type { DesignDoc } from '@/doc/schema'
import { localBlob, putLocalBlob } from '@/persistence/local'
import { useAuth } from '@/stores/auth'
import { openNewDesign } from './create'

// A backup is one JSON file with the design and every photo and sound it uses,
// so it can be opened in another browser, another account or another server.

const KIND = 'krevaya-app/design'
export const BACKUP_EXT = '.krevaya.json'

type Backup = { kind: typeof KIND; version: 1; title: string; doc: DesignDoc; files: Record<string, string> }

/** Every "src" string in the document, wherever it sits (photos, backgrounds, image fills, audio). */
function eachSrc(node: unknown, fn: (src: string) => string | void) {
  if (Array.isArray(node)) {
    for (const v of node) eachSrc(v, fn)
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>
    for (const [k, v] of Object.entries(o)) {
      if (k === 'src' && typeof v === 'string') {
        const next = fn(v)
        if (typeof next === 'string') o[k] = next
      } else eachSrc(v, fn)
    }
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

async function fetchSource(src: string): Promise<Blob | undefined> {
  if (src.startsWith('local:')) return localBlob(src)
  if (src.startsWith('data:')) return undefined
  try {
    const res = await fetch(src, { credentials: 'include' })
    return res.ok ? await res.blob() : undefined
  } catch {
    // a stock photo host that won't share its file; the link stays in the backup
    return undefined
  }
}

export async function makeBackup(title: string, doc: DesignDoc): Promise<Blob> {
  const copy = structuredClone(doc)
  const srcs = new Set<string>()
  eachSrc(copy, (s) => void srcs.add(s))
  const files: Record<string, string> = {}
  for (const src of srcs) {
    const blob = await fetchSource(src)
    if (blob) files[src] = await blobToDataUrl(blob)
  }
  const backup: Backup = { kind: KIND, version: 1, title, doc: copy, files }
  return new Blob([JSON.stringify(backup)], { type: 'application/json' })
}

export async function readBackup(file: File): Promise<Backup> {
  let data: Backup
  try {
    data = JSON.parse(await file.text())
  } catch {
    throw new Error("That file isn't a design backup.")
  }
  if (data?.kind !== KIND || !Array.isArray(data.doc?.pages)) throw new Error("That file isn't a design backup.")
  return data
}

/** Open a backup as a new design, putting its files wherever this person keeps uploads. */
export async function restoreBackup(file: File) {
  const data = await readBackup(file)
  const signedIn = !!useAuth.getState().user
  const moved = new Map<string, string>()
  for (const [src, dataUrl] of Object.entries(data.files ?? {})) {
    const blob = await (await fetch(dataUrl)).blob()
    const name = src.split('/').pop()?.split('?')[0] || 'file'
    if (signedIn) {
      const a = await upload<{ url: string }>('/api/assets', blob, {}, name)
      moved.set(src, a.url)
    } else {
      moved.set(src, await putLocalBlob(blob, name))
    }
  }
  const doc = data.doc
  eachSrc(doc, (s) => moved.get(s))
  await openNewDesign(data.title || 'Restored design', doc)
}
