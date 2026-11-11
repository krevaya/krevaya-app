import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'
import type { DesignDoc, DesignElement, Page } from './schema'
import { DocStore } from './store'

const shape = (id: string, x = 0): DesignElement => ({
  id, type: 'shape', shape: 'rect', fill: { type: 'solid', color: '#000000' }, x, y: 0, width: 10, height: 10, rotation: 0, opacity: 1,
})
const page = (id: string, elements: DesignElement[] = []): Page => ({
  id, width: 100, height: 100, background: { type: 'solid', color: '#ffffff' }, elements,
})

function store(doc: DesignDoc = { pages: [page('p1', [shape('a'), shape('b'), shape('c')])], settings: {} }) {
  const s = new DocStore()
  s.load(doc)
  s.undo.clear()
  return s
}

const ids = (s: DocStore, pageId = 'p1') => s.page(pageId)!.elements.map((e) => e.id)

describe('DocStore', () => {
  it('loads a document and reads it back', () => {
    const s = store()
    expect(s.getSnapshot().pages).toHaveLength(1)
    expect(ids(s)).toEqual(['a', 'b', 'c'])
    expect(s.element('b')?.type).toBe('shape')
    expect(s.pageOf('c')?.id).toBe('p1')
    expect(s.element('nope')).toBeUndefined()
  })

  it('adds, updates and removes elements', () => {
    const s = store()
    s.addElements('p1', [shape('d', 50)])
    s.addElements('p1', [shape('e')], 0)
    expect(ids(s)).toEqual(['e', 'a', 'b', 'c', 'd'])
    s.update('d', { x: 70, opacity: 0.5 })
    expect(s.element('d')).toMatchObject({ x: 70, opacity: 0.5 })
    // undefined deletes the key
    s.update('d', { locked: true })
    s.update('d', { locked: undefined })
    expect('locked' in s.element('d')!).toBe(false)
    s.updateMany([['a', { x: 1 }], ['b', { x: 2 }], ['missing', { x: 3 }]])
    expect([s.element('a')!.x, s.element('b')!.x]).toEqual([1, 2])
    s.remove(['a', 'e'])
    expect(ids(s)).toEqual(['b', 'c', 'd'])
    expect(s.element('a')).toBeUndefined()
  })

  it('reorders in every direction', () => {
    const s = store({ pages: [page('p1', ['a', 'b', 'c', 'd'].map((id) => shape(id)))], settings: {} })
    s.reorder(['a'], 'forward')
    expect(ids(s)).toEqual(['b', 'a', 'c', 'd'])
    s.reorder(['a'], 'front')
    expect(ids(s)).toEqual(['b', 'c', 'd', 'a'])
    s.reorder(['a'], 'backward')
    expect(ids(s)).toEqual(['b', 'c', 'a', 'd'])
    s.reorder(['d', 'c'], 'back')
    expect(ids(s)).toEqual(['c', 'd', 'b', 'a'])
    s.reorder(['b'], 0)
    expect(ids(s)).toEqual(['b', 'c', 'd', 'a'])
    // already at the top: nothing changes
    const before = s.getSnapshot()
    s.reorder(['a'], 'forward')
    expect(s.getSnapshot()).toBe(before)
  })

  it('keeps the same objects for everything a change did not touch', () => {
    const s = store({ pages: [page('p1', [shape('a'), shape('b')]), page('p2', [shape('c')])], settings: {} })
    const before = s.getSnapshot()
    s.update('a', { x: 5 })
    const after = s.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.pages[0]).not.toBe(before.pages[0])
    expect(after.pages[0].elements[0]).not.toBe(before.pages[0].elements[0])
    expect(after.pages[0].elements[1]).toBe(before.pages[0].elements[1])
    expect(after.pages[1]).toBe(before.pages[1])
    expect(after.settings).toBe(before.settings)
    // reads go through the same cache
    expect(s.element('b')).toBe(before.pages[0].elements[1])
  })

  it('tells subscribers about changes', () => {
    const s = store()
    let calls = 0
    const off = s.subscribe(() => calls++)
    s.update('a', { x: 3 })
    s.transact(() => {
      s.update('a', { x: 4 })
      s.update('b', { x: 4 })
    })
    expect(calls).toBe(2)
    off()
    s.update('a', { x: 9 })
    expect(calls).toBe(2)
  })

  it('undoes and redoes, one step per break', () => {
    const s = store()
    s.addElements('p1', [shape('d')])
    s.breakUndo()
    s.update('d', { x: 40 })
    s.breakUndo()
    s.remove(['a'])
    expect(ids(s)).toEqual(['b', 'c', 'd'])
    s.undo.undo()
    expect(ids(s)).toEqual(['a', 'b', 'c', 'd'])
    s.undo.undo()
    expect(s.element('d')!.x).toBe(0)
    s.undo.undo()
    expect(ids(s)).toEqual(['a', 'b', 'c'])
    s.undo.redo()
    s.undo.redo()
    expect(s.element('d')!.x).toBe(40)
  })

  it('only undoes its own edits, not ones that arrive from elsewhere', () => {
    const s = store()
    s.update('a', { x: 1 })
    s.breakUndo()
    s.updateMany([['b', { x: 2 }]], 'remote')
    s.undo.undo()
    expect(s.element('a')!.x).toBe(0)
    expect(s.element('b')!.x).toBe(2)
  })

  it('adds, moves, duplicates and removes pages', () => {
    const s = store({ pages: [page('p1', [{ ...shape('a'), groupId: 'g' }, { ...shape('b'), groupId: 'g' }])], settings: {} })
    s.addPage(page('p2'))
    s.addPage(page('p0'), 0)
    expect(s.getSnapshot().pages.map((p) => p.id)).toEqual(['p0', 'p1', 'p2'])
    s.movePage('p0', 2)
    expect(s.getSnapshot().pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p0'])
    s.updatePage('p2', { width: 300, notes: 'hi' })
    expect(s.page('p2')).toMatchObject({ width: 300, notes: 'hi' })

    const copy = s.duplicatePage('p1')!
    const pages = s.getSnapshot().pages
    expect(pages[1].id).toBe(copy)
    const [x, y] = pages[1].elements
    // fresh ids, and the group is kept together under a new group id
    expect([x.id, y.id]).not.toContain('a')
    expect(x.groupId).toBe(y.groupId)
    expect(x.groupId).not.toBe('g')

    s.removePage('p0')
    s.removePage(copy)
    s.removePage('p2')
    expect(s.getSnapshot().pages.map((p) => p.id)).toEqual(['p1'])
    // the last page stays
    s.removePage('p1')
    expect(s.getSnapshot().pages).toHaveLength(1)
  })

  it('stores settings and survives an encode round trip', () => {
    const s = store()
    s.setSetting('brandKitId', 'kit-1')
    expect(s.getSnapshot().settings.brandKitId).toBe('kit-1')
    const copy = new DocStore(new Y.Doc())
    Y.applyUpdate(copy.ydoc, s.encode())
    expect(copy.getSnapshot()).toEqual(s.getSnapshot())
    s.setSetting('brandKitId', undefined)
    expect(s.getSnapshot().settings).toEqual({})
  })
})
