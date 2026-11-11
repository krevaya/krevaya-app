import { cloneElements } from '@/doc/factory'
import type { DesignElement, Page, TextElement } from '@/doc/schema'
import { uid } from '@/lib/id'
import { bounds, center, originFor } from '@/lib/math'
import { curvedBox, measureTextHeight } from '@/render/text'
import { canEdit, useEditor } from '@/stores/editor'

const st = () => useEditor.getState()

export function currentPage(): Page | undefined {
  const { doc, pageId } = st()
  if (!doc) return
  return (pageId && doc.page(pageId)) || doc.getSnapshot().pages[0]
}

export function selected(): DesignElement[] {
  const { doc, selection } = st()
  if (!doc) return []
  return selection.map((id) => doc.element(id)).filter(Boolean) as DesignElement[]
}

function editable() {
  const s = st()
  return s.doc && canEdit(s.role) ? s.doc : null
}

const TEXT_LAYOUT_KEYS = new Set([
  'text', 'fontFamily', 'fontSize', 'fontWeight', 'italic', 'uppercase', 'lineHeight', 'letterSpacing', 'width', 'list', 'curve',
])

/** Keep text boxes as tall as their text, and curved text boxes sized to the arc. */
export function withTextLayout(el: DesignElement, patch: Partial<DesignElement>): Partial<DesignElement> {
  if (el.type !== 'text' || !Object.keys(patch).some((k) => TEXT_LAYOUT_KEYS.has(k))) return patch
  const next = { ...el, ...patch } as TextElement
  if (next.curve) {
    const box = curvedBox(next)
    // Grow around the center so curving text doesn't make it jump.
    const c = center(el)
    const o = originFor(c.x, c.y, box.width, box.height, el.rotation)
    return { ...patch, width: box.width, height: box.height, x: o.x, y: o.y }
  }
  if (el.curve && !next.curve) {
    const width = Math.max(next.fontSize * 4, Math.min(el.width, next.fontSize * 14))
    return { ...patch, width, height: measureTextHeight({ ...next, width }) }
  }
  return { ...patch, height: measureTextHeight(next) }
}

export function updateElements(patches: Array<[string, Partial<DesignElement>]>) {
  const doc = editable()
  if (!doc) return
  doc.updateMany(patches.map(([id, p]) => {
    const el = doc.element(id)
    return [id, el ? withTextLayout(el, p) : p] as [string, Partial<DesignElement>]
  }))
}

export function updateElement(id: string, patch: Partial<DesignElement>) {
  updateElements([[id, patch]])
}

export function updateSelected(patch: Partial<DesignElement> | ((el: DesignElement) => Partial<DesignElement>)) {
  updateElements(selected().map((el) => [el.id, typeof patch === 'function' ? patch(el) : patch]))
}

/**
 * New elements land in the middle of the page. If something added the same way
 * is already there, put the new one just below it instead of on top. When there's
 * no room below, fan it out down and to the right so each one can still be grabbed.
 */
function avoidStacking(page: Page, el: DesignElement) {
  const step = Math.round(Math.min(page.width, page.height) * 0.03)
  const gap = el.type === 'text' ? el.fontSize * 0.4 : step
  const x0 = el.x
  const y0 = el.y
  const cx = el.x + el.width / 2
  for (let i = 0; i < 12; i++) {
    const hit = page.elements.find(
      (o) => !o.rotation && Math.abs(o.x + o.width / 2 - cx) < 4 && o.y < el.y + el.height && o.y + o.height > el.y,
    )
    if (!hit) return
    const y = hit.y + hit.height + gap
    if (y + el.height > page.height) break
    el.y = y
  }
  el.y = y0
  const sameSpot = () => page.elements.some((o) =>
    Math.abs(o.x + o.width / 2 - (el.x + el.width / 2)) < step / 2 && Math.abs(o.y + o.height / 2 - (el.y + el.height / 2)) < step / 2)
  for (let k = 1; k <= 24 && sameSpot(); k++) {
    const x = x0 + k * step
    const y = y0 + k * step
    if (x + el.width > page.width || y + el.height > page.height) break
    el.x = x
    el.y = y
  }
}

export function addElements(els: DesignElement[], select = true) {
  const doc = editable()
  const page = currentPage()
  if (!doc || !page || !els.length) return
  if (els.length === 1) avoidStacking(page, els[0])
  doc.breakUndo()
  doc.addElements(page.id, els)
  if (select) st().select(els.map((e) => e.id))
}

export function addElement(el: DesignElement, select = true) {
  addElements([el], select)
}

export function deleteSelected() {
  const doc = editable()
  const ids = selected().filter((e) => !e.locked).map((e) => e.id)
  if (!doc || !ids.length) return
  doc.breakUndo()
  doc.remove(ids)
  st().select([])
}

export function duplicateSelected() {
  const els = selected()
  if (!els.length) return
  const copies = cloneElements(els, 24)
  addElements(copies)
}

export function copySelection() {
  const els = selected()
  if (els.length) st().set({ clipboard: structuredClone(els) })
  try {
    void navigator.clipboard?.writeText(JSON.stringify({ app: 'krevaya-app', elements: els }))
  } catch {
    // no system clipboard access here; pasting inside the editor uses the store copy
  }
}

export function cutSelection() {
  copySelection()
  deleteSelected()
}

export function pasteElements(els?: DesignElement[] | null) {
  const src = els ?? st().clipboard
  if (!src?.length) return
  const page = currentPage()
  const sameSpot = page && src.every((e) => page.elements.some((p) => p.id === e.id))
  addElements(cloneElements(src, sameSpot ? 24 : 0))
}

export function selectAll() {
  const page = currentPage()
  if (page) st().select(page.elements.filter((e) => !e.locked && !e.hidden).map((e) => e.id))
}

export function groupSelection() {
  const els = selected()
  if (els.length < 2) return
  const gid = uid()
  updateElements(els.map((e) => [e.id, { groupId: gid }]))
}

export function ungroupSelection() {
  const els = selected().filter((e) => e.groupId)
  if (!els.length) return
  updateElements(els.map((e) => [e.id, { groupId: undefined }]))
  st().set({ selection: els.map((e) => e.id) })
}

export function nudge(dx: number, dy: number) {
  updateSelected((el) => (el.locked ? {} : { x: el.x + dx, y: el.y + dy }))
}

export function toggleLock() {
  const els = selected()
  const lock = !els.every((e) => e.locked)
  updateElements(els.map((e) => [e.id, { locked: lock || undefined }]))
}

export function flip(axis: 'x' | 'y') {
  updateSelected((el) => (axis === 'x' ? { flipX: !el.flipX || undefined } : { flipY: !el.flipY || undefined }))
}

export function reorder(where: 'forward' | 'backward' | 'front' | 'back') {
  const doc = editable()
  if (!doc) return
  doc.breakUndo()
  doc.reorder(st().selection, where)
}

export type AlignKind = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

/** One element aligns to the page; several align to their shared bounds. */
export function align(kind: AlignKind) {
  const els = selected().filter((e) => !e.locked)
  const page = currentPage()
  if (!els.length || !page) return
  const target = els.length === 1 ? { x: 0, y: 0, width: page.width, height: page.height } : bounds(els)
  const groups = new Map<string, DesignElement[]>()
  for (const el of els) {
    const k = els.length > 1 && el.groupId ? el.groupId : el.id
    groups.set(k, [...(groups.get(k) ?? []), el])
  }
  const patches: Array<[string, Partial<DesignElement>]> = []
  for (const members of groups.values()) {
    const b = bounds(members)
    let dx = 0
    let dy = 0
    if (kind === 'left') dx = target.x - b.x
    if (kind === 'center') dx = target.x + target.width / 2 - (b.x + b.width / 2)
    if (kind === 'right') dx = target.x + target.width - (b.x + b.width)
    if (kind === 'top') dy = target.y - b.y
    if (kind === 'middle') dy = target.y + target.height / 2 - (b.y + b.height / 2)
    if (kind === 'bottom') dy = target.y + target.height - (b.y + b.height)
    for (const el of members) patches.push([el.id, { x: el.x + dx, y: el.y + dy }])
  }
  updateElements(patches)
}

export function distribute(axis: 'h' | 'v') {
  const els = selected().filter((e) => !e.locked)
  if (els.length < 3) return
  const withB = els.map((el) => ({ el, b: bounds([el]) }))
  withB.sort((a, b) => (axis === 'h' ? a.b.x - b.b.x : a.b.y - b.b.y))
  const first = withB[0].b
  const last = withB[withB.length - 1].b
  const total = withB.reduce((s, { b }) => s + (axis === 'h' ? b.width : b.height), 0)
  const span = axis === 'h' ? last.x + last.width - first.x : last.y + last.height - first.y
  const gap = (span - total) / (withB.length - 1)
  let cursor = axis === 'h' ? first.x : first.y
  const patches: Array<[string, Partial<DesignElement>]> = []
  for (const { el, b } of withB) {
    const delta = cursor - (axis === 'h' ? b.x : b.y)
    patches.push([el.id, axis === 'h' ? { x: el.x + delta } : { y: el.y + delta }])
    cursor += (axis === 'h' ? b.width : b.height) + gap
  }
  updateElements(patches)
}

export function undo() {
  const { doc, role } = st()
  if (doc && canEdit(role)) doc.undo.undo()
}

export function redo() {
  const { doc, role } = st()
  if (doc && canEdit(role)) doc.undo.redo()
}
