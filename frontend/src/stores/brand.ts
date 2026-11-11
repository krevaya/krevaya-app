import { create } from 'zustand'
import { api } from '@/api/client'

export type BrandKit = {
  id: string
  name: string
  colors: string[]
  fonts: { heading?: string; subheading?: string; body?: string }
  logos: Array<{ url: string; width: number; height: number; name?: string }>
}

type BrandState = {
  kits: BrandKit[]
  active: BrandKit | null
  loaded: boolean
  load: () => Promise<void>
  setActive: (id: string | null) => void
  save: (kit: Partial<BrandKit> & { id?: string }) => Promise<BrandKit>
  remove: (id: string) => Promise<void>
}

export const useBrand = create<BrandState>((set, get) => ({
  kits: [],
  active: null,
  loaded: false,
  load: async () => {
    try {
      const { kits } = await api<{ kits: BrandKit[] }>('/api/brand-kits')
      const want = localStorage.getItem('ka:brand')
      set({ kits, active: kits.find((k) => k.id === want) ?? kits[0] ?? null, loaded: true })
    } catch {
      set({ kits: [], active: null, loaded: true })
    }
  },
  setActive: (id) => {
    if (id) localStorage.setItem('ka:brand', id)
    set({ active: get().kits.find((k) => k.id === id) ?? null })
  },
  save: async (kit) => {
    const body = { name: kit.name ?? 'My brand', colors: kit.colors ?? [], fonts: kit.fonts ?? {}, logos: kit.logos ?? [] }
    const saved = kit.id
      ? await api<BrandKit>(`/api/brand-kits/${kit.id}`, { method: 'PUT', json: body })
      : await api<BrandKit>('/api/brand-kits', { method: 'POST', json: body })
    const kits = kit.id ? get().kits.map((k) => (k.id === saved.id ? saved : k)) : [...get().kits, saved]
    set({ kits, active: get().active?.id === saved.id || !get().active ? saved : get().active })
    return saved
  },
  remove: async (id) => {
    await api(`/api/brand-kits/${id}`, { method: 'DELETE' })
    const kits = get().kits.filter((k) => k.id !== id)
    set({ kits, active: get().active?.id === id ? kits[0] ?? null : get().active })
  },
}))
