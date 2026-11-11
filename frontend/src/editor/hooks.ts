import { useSyncExternalStore } from 'react'
import type { DesignDoc, DesignElement, Page } from '@/doc/schema'
import { useEditor } from '@/stores/editor'

const EMPTY: DesignDoc = { pages: [], settings: {} }
const noop = () => () => {}

export function useDoc(): DesignDoc {
  const doc = useEditor((s) => s.doc)
  return useSyncExternalStore(doc ? doc.subscribe : noop, doc ? doc.getSnapshot : () => EMPTY)
}

export function usePage(): Page | undefined {
  const d = useDoc()
  const pageId = useEditor((s) => s.pageId)
  return d.pages.find((p) => p.id === pageId) ?? d.pages[0]
}

export function useSelected(): DesignElement[] {
  const page = usePage()
  const selection = useEditor((s) => s.selection)
  if (!page) return []
  const set = new Set(selection)
  return page.elements.filter((e) => set.has(e.id))
}
