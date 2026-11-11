import { expect, test } from '@playwright/test'
import {
  insertHeadline, addLine, addShape, clickElement, elements, newGuestDesign, waitForEditor, waitForGuestSave,
} from './helpers'

test('guest makes a design, edits it, and it survives a reload, rename and trash', async ({ page }) => {
  await newGuestDesign(page, 'Instagram post')
  await expect(page.getByText('Guest draft, not backed up')).toBeVisible()

  const heading = await insertHeadline(page)
  expect(heading.type).toBe('text')
  const shape = await addShape(page, 'Circle')
  expect(shape).toMatchObject({ type: 'shape', shape: 'ellipse' })
  const line = await addLine(page, 'Arrow')
  expect(line).toMatchObject({ type: 'line', endHead: 'arrow' })

  // double-click the heading to type into it
  await clickElement(page, heading.id, { dbl: true })
  const box = page.getByRole('textbox', { name: 'Edit text' })
  await expect(box).toBeFocused()
  await box.fill('Spring market')
  await box.press('Escape')
  await expect(box).toBeHidden()
  const text = async () => (await elements(page)).find((e) => e.id === heading.id)?.text
  await expect.poll(text).toBe('Spring market')

  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect.poll(text).toBe(heading.text)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect.poll(text).toBe('Spring market')

  await waitForGuestSave(page)
  await page.reload()
  await waitForEditor(page)
  const after = await elements(page)
  expect(after.map((e) => e.type)).toEqual(['text', 'shape', 'line'])
  expect(after[0].text).toBe('Spring market')

  // rename from the title in the top bar
  await page.getByTitle('Rename').click()
  const title = page.getByRole('textbox', { name: 'Design title' })
  await title.fill('Market poster')
  await title.press('Enter')
  await expect(page.getByTitle('Rename')).toHaveText('Market poster')

  await page.getByRole('button', { name: 'Done' }).click()
  await page.waitForURL('**/designs')
  const card = page.locator('main div.group').filter({ hasText: 'Market poster' })
  await expect(card).toHaveCount(1)
  await card.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Move to trash' }).click()
  await expect(card).toHaveCount(0)

  await page.getByRole('link', { name: 'Trash' }).click()
  const trashed = page.locator('main div.group').filter({ hasText: 'Market poster' })
  await expect(trashed).toHaveCount(1)
  await trashed.getByRole('button', { name: 'More' }).click()
  await page.getByRole('menuitem', { name: 'Restore' }).click()
  await expect(page.getByText('Trash is empty')).toBeVisible()

  await page.getByRole('link', { name: 'Designs' }).click()
  await expect(page.locator('main div.group').filter({ hasText: 'Market poster' })).toHaveCount(1)
})
