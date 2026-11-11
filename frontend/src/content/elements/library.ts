import { api } from '@/api/client'
import type { LibraryItem } from './draw'
import { ILLUSTRATIONS } from './illustrations'
import { STICKERS } from './stickers'

export type LibraryKind = 'illustration' | 'sticker'
export type LibraryEntry = LibraryItem & { url?: string }

type Remote = { id: string; kind: string; name: string; tags: string; svg: string; url: string }

const BUILT_IN: Record<LibraryKind, LibraryEntry[]> = { illustration: ILLUSTRATIONS, sticker: STICKERS }
const remote = new Map<LibraryKind, Promise<LibraryEntry[]>>()

/** Built-in items plus whatever an admin added on the server. Server trouble just means built-ins only. */
export function loadLibrary(kind: LibraryKind): Promise<LibraryEntry[]> {
  let p = remote.get(kind)
  if (!p) {
    p = api<{ elements: Remote[] }>(`/api/elements?kind=${kind}`)
      .then((r) => (r.elements ?? [])
        .filter((e) => e.svg || e.url)
        .map((e) => ({ id: `srv-${e.id}`, name: e.name, tags: e.tags ?? '', svg: e.svg ?? '', url: e.url || undefined })))
      .catch(() => [])
    remote.set(kind, p)
  }
  return p.then((extra) => [...BUILT_IN[kind], ...extra])
}

export function builtIn(kind: LibraryKind): LibraryEntry[] {
  return BUILT_IN[kind]
}

export function matches(item: LibraryItem, needle: string): boolean {
  if (!needle) return true
  const hay = `${item.name} ${item.tags}`.toLowerCase()
  return needle.split(/\s+/).every((w) => hay.includes(w))
}
