import { useEffect, useState } from 'react'
import { api, type DesignMeta } from '@/api/client'
import type { DesignDoc } from '@/doc/schema'

export type Template = DesignMeta
export type TemplateList = { templates: Template[]; categories: string[]; offline?: boolean }

/** Templates from the server; empty lists when offline. `null` while loading. */
export function useTemplates(category = '', q = '') {
  const [data, setData] = useState<TemplateList | null>(null)
  useEffect(() => {
    let live = true
    const params = new URLSearchParams()
    if (category) params.set('category', category)
    if (q) params.set('q', q)
    // small debounce so typing in a search box doesn't fire a request per key
    const t = setTimeout(() => {
      api<TemplateList>(`/api/templates?${params}`)
        .then((r) => live && setData(r))
        .catch(() => live && setData({ templates: [], categories: [], offline: true }))
    }, q ? 200 : 0)
    return () => {
      live = false
      clearTimeout(t)
    }
  }, [category, q])
  return data
}

const docs = new Map<string, Promise<DesignDoc>>()

/** A template's document. Cached per template version, shared by thumbnails and the editor panel. */
export function loadTemplateDoc(id: string, version = ''): Promise<DesignDoc> {
  const key = `${id}:${version}`
  let p = docs.get(key)
  if (!p) {
    p = api<{ doc: DesignDoc }>(`/api/designs/${id}`).then((r) => r.doc)
    p.catch(() => docs.delete(key))
    docs.set(key, p)
  }
  return p
}
