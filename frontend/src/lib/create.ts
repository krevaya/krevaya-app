import * as Y from 'yjs'
import { navigate } from 'wouter/use-browser-location'
import { api } from '@/api/client'
import { newPage } from '@/doc/factory'
import type { DesignDoc } from '@/doc/schema'
import { newLocalDesign } from '@/persistence/local'
import { useAuth } from '@/stores/auth'

export function blankDoc(width: number, height: number): DesignDoc {
  return { pages: [newPage(width, height)], settings: {} }
}

export async function openNewDesign(title: string, doc: DesignDoc) {
  if (useAuth.getState().user) {
    const d = await api<{ id: string }>('/api/designs', { method: 'POST', json: { title, doc } })
    navigate(`/design/${d.id}`)
  } else {
    const id = await newLocalDesign(title, doc)
    navigate(`/local/${id}`)
  }
}

/** Start a design from a template. Guests get a copy in their browser. */
export async function openTemplate(templateId: string, title: string) {
  if (useAuth.getState().user) {
    const d = await api<{ id: string }>('/api/designs', { method: 'POST', json: { template_id: templateId, title } })
    navigate(`/design/${d.id}`)
    return
  }
  const t = await api<{ doc: DesignDoc }>(`/api/designs/${templateId}`)
  const id = await newLocalDesign(title, t.doc)
  navigate(`/local/${id}`)
}

export function docFromState(state: Uint8Array): DesignDoc {
  const ydoc = new Y.Doc()
  Y.applyUpdate(ydoc, state)
  return { pages: ydoc.getArray('pages').toJSON() as DesignDoc['pages'], settings: ydoc.getMap('settings').toJSON() }
}
