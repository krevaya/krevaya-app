import { create } from 'zustand'
import type { DocStore } from '@/doc/store'
import type { DesignElement } from '@/doc/schema'

export type Role = 'owner' | 'edit' | 'comment' | 'view'
export type SaveState = 'saved' | 'saving' | 'offline' | 'error' | 'local' | 'refused'

export type PaneId =
  | 'templates' | 'elements' | 'text' | 'uploads' | 'photos' | 'brand' | 'draw' | 'layers'
  | 'animate' | 'audio' | 'effects' | 'filters' | 'position' | 'comments' | 'background' | 'notes'
  | 'history' | null

type EditorState = {
  doc: DocStore | null
  designId: string | null
  guest: boolean
  role: Role
  title: string
  save: SaveState
  peers: number

  pageId: string | null
  selection: string[]
  editingId: string | null
  cropId: string | null
  hoverId: string | null

  zoom: number
  autoFit: boolean
  panel: PaneId
  rulers: boolean
  snapping: boolean
  highContrast: boolean
  presenting: boolean
  commentMode: boolean

  clipboard: DesignElement[] | null

  set: (patch: Partial<EditorState>) => void
  select: (ids: string[]) => void
  setPage: (id: string) => void
  setZoom: (z: number) => void
  openPanel: (p: PaneId) => void
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: null,
  designId: null,
  guest: true,
  role: 'owner',
  title: 'Untitled design',
  save: 'saved',
  peers: 0,

  pageId: null,
  selection: [],
  editingId: null,
  cropId: null,
  hoverId: null,

  zoom: 1,
  autoFit: true,
  panel: 'templates',
  rulers: false,
  snapping: true,
  highContrast: false,
  presenting: false,
  commentMode: false,

  clipboard: null,

  set: (patch) => set(patch),
  select: (ids) => {
    // Clicking any member of a group selects the whole group.
    const doc = get().doc
    if (doc && ids.length) {
      const expanded = new Set(ids)
      const page = doc.pageOf(ids[0])
      const groups = new Set(ids.map((id) => doc.element(id)?.groupId).filter(Boolean))
      if (page && groups.size) for (const el of page.elements) if (el.groupId && groups.has(el.groupId)) expanded.add(el.id)
      ids = [...expanded]
    }
    set({ selection: ids, editingId: null, cropId: null })
  },
  setPage: (id) => set({ pageId: id, selection: [], editingId: null, cropId: null }),
  setZoom: (z) => set({ zoom: Math.min(8, Math.max(0.05, z)), autoFit: false }),
  openPanel: (p) => set({ panel: get().panel === p ? null : p }),
}))

export const canEdit = (role: Role) => role === 'owner' || role === 'edit'
