import * as Y from 'yjs'
import type { DesignDoc, DesignElement, DesignSettings, Page } from './schema'
import { uid } from '@/lib/id'

export const LOCAL = Symbol('local')

type YPage = Y.Map<unknown>
type YEl = Y.Map<unknown>

function elementToY(el: DesignElement): YEl {
  const m = new Y.Map<unknown>()
  for (const [k, v] of Object.entries(el)) if (v !== undefined) m.set(k, v)
  return m
}

function pageToY(page: Page): YPage {
  const m = new Y.Map<unknown>()
  for (const [k, v] of Object.entries(page)) {
    if (k === 'elements' || v === undefined) continue
    m.set(k, v)
  }
  const els = new Y.Array<YEl>()
  els.push(page.elements.map(elementToY))
  m.set('elements', els)
  return m
}

/**
 * Wraps the Y.Doc for a design.
 *
 * React reads `getSnapshot()`, a plain object that keeps the same identity for
 * every page and element that didn't change. Writes go through the methods
 * here so they land in one transaction and in the undo history.
 */
export class DocStore {
  readonly ydoc: Y.Doc
  readonly pages: Y.Array<YPage>
  readonly settings: Y.Map<unknown>
  readonly undo: Y.UndoManager

  private snapshot: DesignDoc = { pages: [], settings: {} }
  private dirty = new WeakSet<Y.AbstractType<unknown>>()
  private pageCache = new WeakMap<YPage, Page>()
  private elCache = new WeakMap<YEl, DesignElement>()
  private elIndex = new Map<string, { page: YPage; el: YEl }>()
  private pageIndex = new Map<string, YPage>()
  private listeners = new Set<() => void>()

  constructor(ydoc = new Y.Doc()) {
    this.ydoc = ydoc
    this.pages = ydoc.getArray<YPage>('pages')
    this.settings = ydoc.getMap('settings')
    this.undo = new Y.UndoManager([this.pages, this.settings], {
      trackedOrigins: new Set([LOCAL]),
      captureTimeout: 400,
    })
    this.pages.observeDeep((events) => {
      for (const e of events) {
        let t: Y.AbstractType<unknown> | null = e.target as Y.AbstractType<unknown>
        while (t) {
          this.dirty.add(t)
          t = (t._item?.parent as Y.AbstractType<unknown> | undefined) ?? null
        }
      }
    })
    this.settings.observe(() => this.dirty.add(this.settings as Y.AbstractType<unknown>))
    ydoc.on('afterTransaction', (tr) => {
      if (tr.changed.size === 0) return
      this.rebuild()
      for (const l of this.listeners) l()
    })
    this.rebuild()
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = () => this.snapshot

  private rebuild() {
    const pages: Page[] = []
    this.elIndex.clear()
    this.pageIndex.clear()
    for (const yp of this.pages) {
      const yels = yp.get('elements') as Y.Array<YEl>
      let page = this.pageCache.get(yp)
      if (!page || this.dirty.has(yp as Y.AbstractType<unknown>)) {
        const elements: DesignElement[] = []
        for (const ye of yels) {
          let el = this.elCache.get(ye)
          if (!el || this.dirty.has(ye as Y.AbstractType<unknown>)) {
            el = ye.toJSON() as DesignElement
            this.elCache.set(ye, el)
            this.dirty.delete(ye as Y.AbstractType<unknown>)
          }
          elements.push(el)
        }
        const raw: Record<string, unknown> = {}
        for (const [k, v] of yp.entries()) if (k !== 'elements') raw[k] = v
        page = { ...(raw as Omit<Page, 'elements'>), elements }
        this.pageCache.set(yp, page)
        this.dirty.delete(yp as Y.AbstractType<unknown>)
        this.dirty.delete(yels as Y.AbstractType<unknown>)
      }
      pages.push(page)
      this.pageIndex.set(page.id, yp)
      for (const ye of yels) this.elIndex.set(ye.get('id') as string, { page: yp, el: ye })
    }
    let settings = this.snapshot.settings
    if (this.dirty.has(this.settings as Y.AbstractType<unknown>) || pages.length !== this.snapshot.pages.length || !this.snapshot.pages.length) {
      settings = this.settings.toJSON() as DesignSettings
      this.dirty.delete(this.settings as Y.AbstractType<unknown>)
    }
    const same = pages.length === this.snapshot.pages.length && pages.every((p, i) => p === this.snapshot.pages[i])
    if (!same || settings !== this.snapshot.settings) this.snapshot = { pages, settings }
  }

  transact(fn: () => void, origin: unknown = LOCAL) {
    this.ydoc.transact(fn, origin)
  }

  /** Stop the next change from merging into the previous undo step. */
  breakUndo() {
    this.undo.stopCapturing()
  }

  // Reads

  page(id: string): Page | undefined {
    return this.snapshot.pages.find((p) => p.id === id)
  }

  element(id: string): DesignElement | undefined {
    const hit = this.elIndex.get(id)
    return hit ? this.elCache.get(hit.el) : undefined
  }

  pageOf(elementId: string): Page | undefined {
    const hit = this.elIndex.get(elementId)
    return hit ? this.pageCache.get(hit.page) : undefined
  }

  // Pages

  load(doc: DesignDoc, origin: unknown = 'load') {
    this.transact(() => {
      this.pages.delete(0, this.pages.length)
      this.pages.push(doc.pages.map(pageToY))
      for (const k of [...this.settings.keys()]) this.settings.delete(k)
      for (const [k, v] of Object.entries(doc.settings ?? {})) this.settings.set(k, v)
    }, origin)
  }

  addPage(page: Page, index = this.pages.length) {
    this.transact(() => this.pages.insert(index, [pageToY(page)]))
  }

  updatePage(id: string, patch: Partial<Omit<Page, 'elements' | 'id'>>) {
    const yp = this.pageIndex.get(id)
    if (!yp) return
    this.transact(() => {
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) yp.delete(k)
        else yp.set(k, v)
      }
    })
  }

  removePage(id: string) {
    const i = this.snapshot.pages.findIndex((p) => p.id === id)
    if (i < 0 || this.pages.length <= 1) return
    this.transact(() => this.pages.delete(i, 1))
  }

  movePage(id: string, to: number) {
    const from = this.snapshot.pages.findIndex((p) => p.id === id)
    if (from < 0 || from === to) return
    const page = this.snapshot.pages[from]
    this.transact(() => {
      this.pages.delete(from, 1)
      this.pages.insert(Math.max(0, Math.min(to, this.pages.length)), [pageToY(page)])
    })
  }

  duplicatePage(id: string): string | undefined {
    const i = this.snapshot.pages.findIndex((p) => p.id === id)
    if (i < 0) return
    const src = this.snapshot.pages[i]
    const groups = new Map<string, string>()
    const copy: Page = {
      ...structuredClone(src),
      id: uid(),
      elements: src.elements.map((el) => ({
        ...structuredClone(el),
        id: uid(),
        groupId: el.groupId ? groups.get(el.groupId) ?? groups.set(el.groupId, uid()).get(el.groupId) : undefined,
      })),
    }
    this.addPage(copy, i + 1)
    return copy.id
  }

  // Elements

  addElements(pageId: string, els: DesignElement[], index?: number) {
    const yp = this.pageIndex.get(pageId)
    if (!yp) return
    const arr = yp.get('elements') as Y.Array<YEl>
    this.transact(() => arr.insert(index ?? arr.length, els.map(elementToY)))
  }

  update(id: string, patch: Partial<DesignElement>) {
    this.updateMany([[id, patch]])
  }

  updateMany(patches: Array<[string, Partial<DesignElement>]>, origin: unknown = LOCAL) {
    this.transact(() => {
      for (const [id, patch] of patches) {
        const hit = this.elIndex.get(id)
        if (!hit) continue
        for (const [k, v] of Object.entries(patch)) {
          if (v === undefined) hit.el.delete(k)
          else if (hit.el.get(k) !== v) hit.el.set(k, v)
        }
      }
    }, origin)
  }

  remove(ids: string[]) {
    const set = new Set(ids)
    this.transact(() => {
      for (const yp of this.pages) {
        const arr = yp.get('elements') as Y.Array<YEl>
        for (let i = arr.length - 1; i >= 0; i--) {
          if (set.has(arr.get(i).get('id') as string)) arr.delete(i, 1)
        }
      }
    })
  }

  /** Move elements within their page's stacking order. */
  reorder(ids: string[], where: 'forward' | 'backward' | 'front' | 'back' | number) {
    const page = ids.length ? this.pageOf(ids[0]) : undefined
    if (!page) return
    const yp = this.pageIndex.get(page.id)!
    const arr = yp.get('elements') as Y.Array<YEl>
    const order = page.elements.map((e) => e.id)
    const moving = order.filter((id) => ids.includes(id))
    const rest = order.filter((id) => !ids.includes(id))
    let next: string[]
    if (where === 'front') next = [...rest, ...moving]
    else if (where === 'back') next = [...moving, ...rest]
    else if (typeof where === 'number') {
      next = [...rest]
      next.splice(Math.max(0, Math.min(where, rest.length)), 0, ...moving)
    } else {
      next = [...order]
      const step = where === 'forward' ? 1 : -1
      const idxs = moving.map((id) => next.indexOf(id))
      const sorted = step > 0 ? [...idxs].sort((a, b) => b - a) : [...idxs].sort((a, b) => a - b)
      for (const i of sorted) {
        const j = i + step
        if (j < 0 || j >= next.length || moving.includes(next[j])) continue
        ;[next[i], next[j]] = [next[j], next[i]]
      }
    }
    if (next.join() === order.join()) return
    const byId = new Map(page.elements.map((e) => [e.id, e]))
    this.transact(() => {
      arr.delete(0, arr.length)
      arr.push(next.map((id) => elementToY(byId.get(id)!)))
    })
  }

  // Settings

  setSetting<K extends keyof DesignSettings>(key: K, value: DesignSettings[K]) {
    this.transact(() => {
      if (value === undefined) this.settings.delete(key)
      else this.settings.set(key, value)
    })
  }

  encode(): Uint8Array {
    return Y.encodeStateAsUpdate(this.ydoc)
  }

  destroy() {
    this.undo.destroy()
    this.listeners.clear()
  }
}
