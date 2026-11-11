import { expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'

// Shapes of what the dev build exposes on window.__ka (see src/views/Editor.tsx).
export type El = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  rotation: number
  text?: string
  fontFamily?: string
  hidden?: boolean
  locked?: boolean
  groupId?: string
  [k: string]: unknown
}
export type PageDoc = { id: string; width: number; height: number; elements: El[]; [k: string]: unknown }

export const PASSWORD = 'slate-otter-2048'

let counter = 0
export function uniqueEmail(tag: string) {
  return `${tag}-${Date.now().toString(36)}-${process.pid}-${counter++}@example.com`
}

/** Sign up through the API; the session cookie lands in the page's browser context. */
export async function signUp(request: APIRequestContext, email = uniqueEmail('user'), name = 'Test user') {
  const res = await request.post('/api/auth/signup', { data: { email, password: PASSWORD, name } })
  expect(res.ok(), await res.text()).toBeTruthy()
  return { email, user: await res.json() }
}

export async function apiJson<T = any>(request: APIRequestContext, method: string, path: string, data?: unknown): Promise<T> {
  const res = await request.fetch(path, { method, data })
  expect(res.ok(), `${method} ${path}: ${res.status()} ${await res.text()}`).toBeTruthy()
  return (await res.json()) as T
}

/** Wait until the editor has a document and the canvas has drawn the page. */
export async function waitForEditor(page: Page) {
  await expect(page.getByRole('main', { name: 'Canvas' })).toBeVisible()
  await page.waitForFunction(() => {
    const ka = (window as any).__ka
    return !!ka?.editor.getState().doc && !!ka.engine()
  })
}

/** Start a blank guest design from one of the format cards on the Create page. */
export async function newGuestDesign(page: Page, format = 'Instagram post', group = 'Popular') {
  await page.goto('/')
  if (group !== 'Popular') await page.getByRole('button', { name: group, exact: true }).click()
  await page.getByRole('button', { name: new RegExp(`^${format}`) }).first().click()
  await page.waitForURL(/\/local\//)
  await waitForEditor(page)
}

export async function currentPage(page: Page): Promise<PageDoc> {
  return page.evaluate(() => {
    const s = (window as any).__ka.editor.getState()
    const pages = s.doc.getSnapshot().pages
    return pages.find((p: { id: string }) => p.id === s.pageId) ?? pages[0]
  })
}

export async function elements(page: Page): Promise<El[]> {
  return (await currentPage(page)).elements
}

export async function pages(page: Page): Promise<PageDoc[]> {
  return page.evaluate(() => (window as any).__ka.editor.getState().doc.getSnapshot().pages)
}

export async function selection(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as any).__ka.editor.getState().selection)
}

export async function editorState<T = unknown>(page: Page, key: string): Promise<T> {
  return page.evaluate((k) => (window as any).__ka.editor.getState()[k], key)
}

/** Screen position of a point on the page (in page units). */
export async function screenPoint(page: Page, x: number, y: number) {
  return page.evaluate(([px, py]) => {
    const engine = (window as any).__ka.engine()
    const rect = engine.stage.container().getBoundingClientRect()
    const v = engine.view
    return { x: rect.left + v.panX + px * v.zoom, y: rect.top + v.panY + py * v.zoom }
  }, [x, y])
}

/** Screen center of an element on the canvas. */
export async function elementCenter(page: Page, id: string) {
  const el = (await elements(page)).find((e) => e.id === id)
  if (!el) throw new Error(`no element ${id}`)
  return screenPoint(page, el.x + el.width / 2, el.y + el.height / 2)
}

export async function clickElement(page: Page, id: string, opts: { shift?: boolean; dbl?: boolean } = {}) {
  const p = await elementCenter(page, id)
  if (opts.shift) await page.keyboard.down('Shift')
  if (opts.dbl) await page.mouse.dblclick(p.x, p.y)
  else await page.mouse.click(p.x, p.y)
  if (opts.shift) await page.keyboard.up('Shift')
}

/** Click an empty spot of the canvas, outside the page. */
export async function clickBlank(page: Page) {
  const box = (await page.getByRole('main', { name: 'Canvas' }).boundingBox())!
  await page.mouse.click(box.x + 12, box.y + box.height - 12)
}

export function toolRail(page: Page) {
  return page.getByRole('navigation', { name: 'Tools' })
}

export async function openTool(page: Page, name: string) {
  const btn = toolRail(page).getByRole('button', { name, exact: true })
  if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click()
  return page.getByRole('complementary', { name })
}

export async function insertHeadline(page: Page) {
  const before = (await elements(page)).length
  const panel = await openTool(page, 'Text')
  await panel.getByRole('button', { name: 'Headline', exact: true }).click()
  await expect.poll(async () => (await elements(page)).length).toBe(before + 1)
  return (await elements(page)).at(-1)!
}

export async function addShape(page: Page, name = 'Square') {
  const before = (await elements(page)).length
  const panel = await openTool(page, 'Elements')
  // shapes come before icons, which can share a name (Star, Heart)
  await panel.getByRole('button', { name, exact: true }).first().click()
  await expect.poll(async () => (await elements(page)).length).toBe(before + 1)
  return (await elements(page)).at(-1)!
}

export async function addLine(page: Page, name = 'Line') {
  const before = (await elements(page)).length
  const panel = await openTool(page, 'Elements')
  await panel.getByRole('button', { name, exact: true }).click()
  await expect.poll(async () => (await elements(page)).length).toBe(before + 1)
  return (await elements(page)).at(-1)!
}

export function selectionToolbar(page: Page): Locator {
  return page.getByRole('toolbar', { name: 'Selection tools' })
}

export function mod() {
  return process.platform === 'darwin' ? 'Meta' : 'Control'
}

/** Press a shortcut with the platform's command key, e.g. press(page, 'z'). */
export async function press(page: Page, key: string) {
  await page.keyboard.press(`${mod()}+${key}`)
}

/** Resolve once the guest design in IndexedDB matches what's in the editor. */
export async function waitForGuestSave(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const s = (window as any).__ka.editor.getState()
        const db: IDBDatabase = await new Promise((resolve, reject) => {
          const req = indexedDB.open('krevaya-app')
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => reject(req.error)
        })
        const row: any = await new Promise((resolve) => {
          const req = db.transaction('designs').objectStore('designs').get(s.designId)
          req.onsuccess = () => resolve(req.result)
        })
        db.close()
        const mine: Uint8Array = s.doc.encode()
        const saved: Uint8Array | undefined = row?.state
        return !!saved && saved.length === mine.length && saved.every((b, i) => b === mine[i])
      }),
    )
    .toBe(true)
}
