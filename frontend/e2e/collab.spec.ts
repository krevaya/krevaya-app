import { expect, test, type Browser, type Page } from '@playwright/test'
import {
  insertHeadline, addShape, apiJson, clickElement, elements, openTool, signUp, toolRail, waitForEditor,
} from './helpers'

/** A signed-in owner with a fresh design open in the editor. */
async function ownerWithDesign(page: Page, title: string) {
  await signUp(page.request)
  const d = await apiJson<{ id: string }>(page.request, 'POST', '/api/designs', { title, width: 1080, height: 1080 })
  await page.goto(`/design/${d.id}`)
  await waitForEditor(page)
  await expect(page.getByText('All changes saved')).toBeVisible()
  return d.id
}

/** Make a share link from the Share dialog and return its path. */
async function shareLink(page: Page, access: 'Can view' | 'Can comment' | 'Can edit') {
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Add link' }).click()
  await dialog.getByRole('combobox', { name: 'Access for the new link' }).selectOption({ label: access })
  const created = page.waitForResponse((r) => r.url().endsWith('/links') && r.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Make link' }).click()
  const link = await (await created).json()
  await expect(dialog.locator('li').filter({ has: page.locator(`code[title="${link.url}"]`) })).toHaveCount(1)
  await dialog.getByRole('button', { name: 'Close' }).click()
  return new URL(link.url).pathname
}

async function visitor(browser: Browser, path: string) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(path)
  await waitForEditor(page)
  return page
}

test('edit and view links, live edits, presence, and turning a link off', async ({ page, browser }) => {
  await ownerWithDesign(page, 'Team poster')
  const editPath = await shareLink(page, 'Can edit')
  expect(editPath).toMatch(/^\/s\//)

  const guest = await visitor(browser, editPath)
  await expect(guest.getByTitle('Rename')).toHaveText('Team poster')
  await expect(page.getByLabel('1 other here')).toBeVisible()
  await expect(guest.getByLabel('1 other here')).toBeVisible()

  // edits go both ways
  const heading = await insertHeadline(page)
  await expect.poll(async () => (await elements(guest)).map((e) => e.id)).toEqual([heading.id])
  const shape = await addShape(guest, 'Triangle')
  await expect.poll(async () => (await elements(page)).map((e) => e.id)).toEqual([heading.id, shape.id])
  await clickElement(guest, heading.id, { dbl: true })
  await guest.getByRole('textbox', { name: 'Edit text' }).fill('Made together')
  await guest.getByRole('textbox', { name: 'Edit text' }).press('Escape')
  await expect.poll(async () => (await elements(page))[0].text).toBe('Made together')

  // a view link shows the design but none of the editing tools
  const viewPath = await shareLink(page, 'Can view')
  const viewer = await visitor(browser, viewPath)
  await expect.poll(async () => (await elements(viewer)).length).toBe(2)
  await expect(toolRail(viewer).getByRole('button', { name: 'Elements' })).toHaveCount(0)
  await expect(viewer.getByRole('button', { name: 'Undo', exact: true })).toHaveCount(0)
  await clickElement(viewer, shape.id)
  await viewer.keyboard.press('Delete')
  await viewer.keyboard.press('ArrowLeft')
  await expect(page.getByLabel('2 others here')).toBeVisible()
  const after = await elements(page)
  expect(after).toHaveLength(2)
  expect(after[1].x).toBe(shape.x)

  // turning off the edit link locks its visitor out
  await page.getByRole('button', { name: 'Share', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const editRow = dialog.locator('li').filter({ has: page.locator(`code[title$="${editPath.split('/').pop()}"]`) })
  page.once('dialog', (d) => void d.accept())
  await editRow.getByRole('button', { name: 'Remove link' }).click()
  await expect(editRow).toHaveCount(0)
  await expect(guest.getByText("You can't edit this design any more")).toBeVisible()
  await expect(toolRail(guest).getByRole('button', { name: 'Elements' })).toHaveCount(0)
  await guest.reload()
  await expect(guest.getByText("This link doesn't work any more.", { exact: false })).toBeVisible()

  await guest.context().close()
  await viewer.context().close()
})

test('comments with replies and resolving, and versions', async ({ page, browser }) => {
  await ownerWithDesign(page, 'Menu card')
  const heading = await insertHeadline(page)

  const comments = await openTool(page, 'Comments')
  await comments.getByRole('button', { name: 'Add comment' }).click()
  const spot = await page.evaluate(() => {
    const engine = (window as any).__ka.engine()
    const r = engine.stage.container().getBoundingClientRect()
    return { x: r.left + engine.view.panX + 200 * engine.view.zoom, y: r.top + engine.view.panY + 200 * engine.view.zoom }
  })
  await page.mouse.click(spot.x, spot.y)
  await page.getByRole('textbox', { name: 'Comment', exact: true }).fill('Can we make the title bigger?')
  await page.getByRole('button', { name: 'Comment', exact: true }).click()
  const thread = comments.locator('li[id^="thread-"]')
  await expect(thread).toHaveCount(1)
  await expect(thread).toContainText('Can we make the title bigger?')
  await expect(page.getByRole('button', { name: /^Comment 1 by / })).toBeVisible()

  // someone with a comment link replies without an account
  const commentPath = await shareLink(page, 'Can comment')
  const guest = await visitor(browser, commentPath)
  const guestPanel = guest.getByRole('complementary', { name: 'Comments' })
  const guestThread = guestPanel.locator('li[id^="thread-"]')
  await expect(guestThread).toContainText('Can we make the title bigger?')
  await guestThread.click()
  await guestThread.getByRole('textbox', { name: 'Reply' }).fill('Sure, on it')
  await guestThread.getByRole('button', { name: 'Reply' }).click()
  await expect(guestThread).toContainText('Sure, on it')
  await guest.context().close()

  // comments aren't pushed live; they load when the panel opens
  await page.reload()
  await waitForEditor(page)
  const panel = await openTool(page, 'Comments')
  await expect(panel.locator('li[id^="thread-"]')).toContainText('Sure, on it')
  await panel.getByRole('button', { name: 'Resolve' }).click()
  await expect(panel.getByText('All caught up')).toBeVisible()
  await panel.getByText('Show resolved (1)').click()
  await expect(panel.locator('li[id^="thread-"]')).toContainText('Resolved')

  // save a version, change things, then go back to it
  await page.getByRole('button', { name: 'File' }).click()
  await page.getByRole('menuitem', { name: 'Version history' }).click()
  const history = page.getByRole('complementary', { name: 'Version history' })
  await history.getByRole('textbox', { name: 'Version name' }).fill('Before the shapes')
  await history.getByRole('button', { name: 'Save version' }).click()
  const row = history.locator('li').filter({ hasText: 'Before the shapes' })
  await expect(row).toHaveCount(1)

  await addShape(page, 'Diamond')
  await addShape(page, 'Burst')
  await expect.poll(async () => (await elements(page)).length).toBe(3)

  await page.getByRole('button', { name: 'File' }).click()
  await page.getByRole('menuitem', { name: 'Version history' }).click()
  await row.getByRole('button').first().click()
  await expect(row.getByRole('img', { name: 'Page 1' })).toBeVisible()
  page.once('dialog', (d) => void d.accept())
  await row.getByRole('button', { name: 'Restore this version' }).click()
  await expect.poll(async () => (await elements(page)).map((e) => e.id)).toEqual([heading.id])
  // what was there before the restore is kept as a version too
  await expect(history.locator('li').filter({ hasText: 'Before restoring an older version' })).toHaveCount(1)
})
