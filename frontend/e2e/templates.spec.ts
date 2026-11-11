import { expect, test } from '@playwright/test'
import { editorState, openTool, pages, waitForEditor } from './helpers'

test('the gallery lists the starter templates and opens one as a new design', async ({ page }) => {
  await page.goto('/templates')
  const tiles = page.locator('main .grid > button')
  await expect(tiles).toHaveCount(12)
  for (const title of ['Podcast episode cover', 'Recipe card', 'LinkedIn carousel', 'Weekly planner', 'Thank-you card']) {
    await expect(tiles.filter({ hasText: title })).toHaveCount(1)
  }

  // categories filter the grid
  await page.getByRole('button', { name: 'presentation', exact: true }).click()
  await expect(tiles).toHaveCount(1)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(tiles).toHaveCount(12)

  await tiles.filter({ hasText: 'LinkedIn carousel' }).click()
  await page.waitForURL(/\/local\//)
  await waitForEditor(page)
  await expect(page.getByTitle('Rename')).toHaveText('LinkedIn carousel')
  const ps = await pages(page)
  expect(ps).toHaveLength(5)
  expect(ps.every((p) => p.width === 1080 && p.height === 1350 && p.elements.length > 0)).toBe(true)
})

test('the Templates panel replaces a page or adds pages, and both undo', async ({ page }) => {
  await page.goto('/templates')
  await page.locator('main .grid > button').filter({ hasText: 'Recipe card' }).click()
  await page.waitForURL(/\/local\//)
  await waitForEditor(page)

  const panel = await openTool(page, 'Templates')
  const original = await pages(page)
  expect(original).toHaveLength(1)

  await panel.getByRole('button', { name: 'Use template: Podcast episode cover' }).click()
  await panel.getByRole('button', { name: 'Replace this page' }).click()
  await expect.poll(async () => (await pages(page))[0].id).not.toBe(original[0].id)
  let now = await pages(page)
  expect(now).toHaveLength(1)
  // resized to the design's page size
  expect(now[0]).toMatchObject({ width: 1080, height: 1350 })
  expect(await editorState(page, 'pageId')).toBe(now[0].id)

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await pages(page)).map((p) => p.id)).toEqual([original[0].id])

  await panel.getByRole('button', { name: 'Use template: Thank-you card' }).click()
  await panel.getByRole('button', { name: 'Add 2 pages after' }).click()
  await expect.poll(async () => (await pages(page)).length).toBe(3)
  now = await pages(page)
  expect(now[0].id).toBe(original[0].id)
  expect(now.every((p) => p.width === 1080 && p.height === 1350)).toBe(true)
  await expect(page.getByText('Page 2 / 3')).toBeVisible()

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(async () => (await pages(page)).map((p) => p.id)).toEqual([original[0].id])
  await expect(page.getByText('Page 1 / 1')).toBeVisible()
})
