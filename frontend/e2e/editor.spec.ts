import { expect, test, type Page } from '@playwright/test'
import {
  insertHeadline, addShape, clickBlank, clickElement, currentPage, editorState, elements, newGuestDesign, openTool, pages,
  press, screenPoint, selection, selectionToolbar,
} from './helpers'

const byId = async (page: Page, id: string) => (await elements(page)).find((e) => e.id === id)!

test('select, marquee, group and ungroup, align', async ({ page }) => {
  await newGuestDesign(page, 'Square post', 'Social')
  const a = await addShape(page, 'Square')
  const b = await addShape(page, 'Circle')
  expect(b.y).toBeGreaterThan(a.y)

  await clickElement(page, a.id)
  await expect.poll(() => selection(page)).toEqual([a.id])
  await clickElement(page, b.id, { shift: true })
  await expect.poll(() => selection(page)).toEqual([a.id, b.id])
  await expect(selectionToolbar(page).getByText('2 selected')).toBeVisible()
  await clickBlank(page)
  await expect.poll(() => selection(page)).toEqual([])

  // drag a box around both from the empty top-left of the page
  const from = await screenPoint(page, 20, 20)
  const to = await screenPoint(page, 1060, 1060)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await selection(page)).sort()).toEqual([a.id, b.id].sort())

  await selectionToolbar(page).getByRole('button', { name: 'Group' }).click()
  await expect.poll(async () => (await byId(page, a.id)).groupId).toBeTruthy()
  expect((await byId(page, b.id)).groupId).toBe((await byId(page, a.id)).groupId)
  // clicking one member picks up the whole group
  await clickBlank(page)
  await clickElement(page, a.id)
  await expect.poll(async () => (await selection(page)).sort()).toEqual([a.id, b.id].sort())
  await selectionToolbar(page).getByRole('button', { name: 'Ungroup' }).click()
  await expect.poll(async () => (await byId(page, a.id)).groupId).toBeUndefined()
  expect((await byId(page, b.id)).groupId).toBeUndefined()

  // several elements align to their shared bounds
  await selectionToolbar(page).getByRole('button', { name: 'Align' }).click()
  await page.getByRole('button', { name: 'left', exact: true }).click()
  await page.keyboard.press('Escape')
  const [ax, bx] = [(await byId(page, a.id)).x, (await byId(page, b.id)).x]
  expect(ax).toBe(bx)

  // one element aligns to the page
  await clickBlank(page)
  await clickElement(page, b.id)
  const position = await openTool(page, 'Position')
  await position.getByRole('button', { name: 'Right' }).click()
  await expect.poll(async () => { const e = await byId(page, b.id); return e.x + e.width }).toBe(1080)
  await position.getByRole('button', { name: 'Top' }).click()
  await expect.poll(async () => (await byId(page, b.id)).y).toBe(0)
})

test('layers panel reorders, hides and locks', async ({ page }) => {
  await newGuestDesign(page, 'Square post', 'Social')
  const heading = await insertHeadline(page)
  const shape = await addShape(page, 'Star')
  const panel = await openTool(page, 'Position')
  await panel.getByRole('tab', { name: 'Layers' }).click()
  const rows = panel.locator('li')
  await expect(rows).toHaveCount(2)
  // front at the top
  await expect(rows.nth(0)).toContainText('star')
  await expect(rows.nth(1)).toContainText(heading.text!)

  await rows.nth(1).dragTo(rows.nth(0))
  await expect.poll(async () => (await elements(page)).map((e) => e.id)).toEqual([shape.id, heading.id])
  await expect(rows.nth(0)).toContainText(heading.text!)

  await rows.nth(1).hover()
  await rows.nth(1).getByRole('button', { name: 'Hide' }).click()
  await expect.poll(async () => (await byId(page, shape.id)).hidden).toBe(true)
  await expect(rows.nth(1).getByRole('button', { name: 'Show' })).toBeVisible()

  await rows.nth(0).hover()
  await rows.nth(0).getByRole('button', { name: 'Lock' }).click()
  await expect.poll(async () => (await byId(page, heading.id)).locked).toBe(true)
  // locked elements stay put
  await rows.nth(0).click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Delete')
  const h = await byId(page, heading.id)
  expect(h).toBeTruthy()
  expect(h.x).toBe(heading.x)

  await rows.nth(0).getByRole('button', { name: 'Unlock' }).click()
  await expect.poll(async () => (await byId(page, heading.id)).locked).toBeUndefined()
})

test('pages can be added, duplicated, deleted and reordered', async ({ page }) => {
  await newGuestDesign(page, 'Presentation')
  await insertHeadline(page)
  const first = (await pages(page))[0]

  await page.getByRole('button', { name: 'Add page' }).click()
  await expect(page.getByText('Page 2 / 2')).toBeVisible()
  const second = (await pages(page))[1]
  expect(second.elements).toHaveLength(0)
  expect(await editorState(page, 'pageId')).toBe(second.id)

  await page.getByRole('button', { name: 'Pages', exact: true }).click()
  const thumbs = page.getByRole('button', { name: /^Page \d+$/ })
  await expect(thumbs).toHaveCount(2)

  // duplicate the first page
  await thumbs.nth(0).hover()
  await thumbs.nth(0).locator('..').getByTitle('Duplicate page').click()
  await expect(thumbs).toHaveCount(3)
  let ps = await pages(page)
  expect(ps[0].id).toBe(first.id)
  expect(ps[1].elements).toHaveLength(1)
  expect(ps[1].elements[0].id).not.toBe(first.elements[0].id)
  await expect(page.getByText('Page 2 / 3')).toBeVisible()

  // drag the empty page to the front
  await thumbs.nth(2).dragTo(thumbs.nth(0))
  await expect.poll(async () => (await pages(page))[0].id).toBe(second.id)

  // delete it again
  await thumbs.nth(0).hover()
  await thumbs.nth(0).locator('..').getByTitle('Delete page').click()
  await expect(thumbs).toHaveCount(2)
  ps = await pages(page)
  expect(ps.map((p) => p.id)).not.toContain(second.id)
  expect(ps[0].id).toBe(first.id)

  await page.getByRole('button', { name: 'Previous page' }).click()
  await expect(page.getByText('Page 1 / 2')).toBeVisible()
  await page.getByRole('button', { name: 'Next page' }).click()
  await expect(page.getByText('Page 2 / 2')).toBeVisible()
})

test('resize menu and zoom', async ({ page }) => {
  await newGuestDesign(page, 'Square post', 'Social')
  const shape = await addShape(page, 'Square')

  await page.getByRole('button', { name: 'Resize', exact: true }).click()
  const menu = page.locator('[data-overlay="popover"]')
  await menu.getByRole('button', { name: /^Story/ }).click()
  await expect(menu.getByLabel('Width')).toHaveValue('1080')
  await expect(menu.getByLabel('Height')).toHaveValue('1920')
  await menu.getByRole('button', { name: 'Resize', exact: true }).click()
  await expect.poll(async () => { const p = await currentPage(page); return [p.width, p.height] }).toEqual([1080, 1920])
  await expect(page.getByText('Story · 1080 × 1920 px')).toBeVisible()
  // elements come along, still on the page
  const moved = await byId(page, shape.id)
  expect(moved.y + moved.height).toBeLessThanOrEqual(1920)

  const fit = await editorState<number>(page, 'zoom')
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await page.getByRole('button', { name: 'Zoom in' }).click()
  await expect.poll(() => editorState<number>(page, 'zoom')).toBeCloseTo(fit * 1.44, 3)
  await page.getByRole('button', { name: 'Fit to screen' }).click()
  await expect.poll(() => editorState<number>(page, 'zoom')).toBeCloseTo(fit, 3)
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect.poll(() => editorState<number>(page, 'zoom')).toBeCloseTo(fit / 1.2, 3)
  await press(page, '0')
  await expect.poll(() => editorState<number>(page, 'zoom')).toBeCloseTo(fit, 3)
})

test('keyboard shortcuts copy, paste, duplicate, delete and nudge', async ({ page }) => {
  await newGuestDesign(page, 'Square post', 'Social')
  const shape = await addShape(page, 'Hexagon')
  await clickElement(page, shape.id)
  await expect.poll(() => selection(page)).toEqual([shape.id])

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  await expect.poll(async () => { const e = await byId(page, shape.id); return [e.x, e.y] }).toEqual([shape.x + 1, shape.y + 10])

  await press(page, 'c')
  await press(page, 'v')
  await expect.poll(async () => (await elements(page)).length).toBe(2)
  const pasted = (await elements(page))[1]
  expect(pasted).toMatchObject({ type: 'shape', shape: 'hexagon' })
  expect(pasted.id).not.toBe(shape.id)
  expect(await selection(page)).toEqual([pasted.id])

  await press(page, 'd')
  await expect.poll(async () => (await elements(page)).length).toBe(3)
  const dup = (await elements(page))[2]
  expect(dup.x).toBe(pasted.x + 24)

  await page.keyboard.press('Delete')
  await expect.poll(async () => (await elements(page)).length).toBe(2)
  expect(await selection(page)).toEqual([])
  await clickElement(page, pasted.id)
  await page.keyboard.press('Backspace')
  await expect.poll(async () => (await elements(page)).length).toBe(1)

  await press(page, 'z')
  await expect.poll(async () => (await elements(page)).length).toBe(2)
  await press(page, 'Shift+z')
  await expect.poll(async () => (await elements(page)).length).toBe(1)

  await press(page, 'a')
  await expect.poll(() => selection(page)).toEqual([shape.id])
  await page.keyboard.press('Escape')
  await expect.poll(() => selection(page)).toEqual([])
})
