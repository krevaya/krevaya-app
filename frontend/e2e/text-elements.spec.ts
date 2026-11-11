import { expect, test } from '@playwright/test'
import { insertHeadline, elements, newGuestDesign, openTool, selection, selectionToolbar } from './helpers'

test('font, effect and curve on a heading', async ({ page }) => {
  await newGuestDesign(page, 'Instagram post')
  const heading = await insertHeadline(page)
  const el = async () => (await elements(page)).find((e) => e.id === heading.id)!

  await selectionToolbar(page).getByRole('button', { name: 'Font', exact: true }).click()
  await page.getByPlaceholder('Search fonts').fill('bebas')
  await page.getByRole('button', { name: 'Bebas Neue', exact: true }).click()
  await expect.poll(async () => (await el()).fontFamily).toBe('Bebas Neue')
  await expect(selectionToolbar(page).getByRole('button', { name: 'Font', exact: true })).toHaveText('Bebas Neue')
  // the font file comes from the server and gets used
  await expect.poll(() => page.evaluate(() => document.fonts.check('40px "Bebas Neue"'))).toBe(true)

  await selectionToolbar(page).getByRole('button', { name: 'Effects' }).click()
  const panel = page.getByRole('complementary', { name: 'Effects' })
  await panel.getByRole('button', { name: 'Neon', exact: true }).click()
  await expect.poll(async () => (await el()).effect).toMatchObject({ type: 'neon' })
  await expect(panel.getByRole('button', { name: 'Neon', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await panel.getByRole('button', { name: 'Outline', exact: true }).click()
  await expect.poll(async () => (await el()).effect).toMatchObject({ type: 'outline' })

  const flat = await el()
  await panel.getByRole('button', { name: 'Curve', exact: true }).click()
  await expect.poll(async () => (await el()).curve).toBe(50)
  const curved = await el()
  // the box is resized to the arc
  expect(curved.height).not.toBe(flat.height)
  await expect(panel.getByText('Curved text stays on one line.', { exact: false })).toBeVisible()
  await panel.getByRole('button', { name: 'None', exact: true }).last().click()
  await expect.poll(async () => (await el()).curve).toBeUndefined()
})

test('search for an icon and add it, then add a QR code', async ({ page }) => {
  await newGuestDesign(page, 'Instagram post')
  const panel = await openTool(page, 'Elements')
  // the icons section's "See all" opens the full icon search
  await panel.getByRole('button', { name: 'See all' }).first().click()
  await panel.getByPlaceholder('Search icons').fill('rocket')
  const icon = panel.getByRole('button', { name: /rocket/i }).first()
  await expect(icon).toBeEnabled()
  await icon.click()
  await expect.poll(async () => (await elements(page)).length).toBe(1)
  const added = (await elements(page))[0]
  expect(added).toMatchObject({ type: 'svg', kind: 'icon' })
  expect(String(added.svg)).toContain('<svg')
  await expect(selectionToolbar(page).getByRole('button', { name: 'Graphic color' }).first()).toBeVisible()

  await panel.getByRole('button', { name: 'Back to all elements' }).click()
  await panel.getByRole('button', { name: 'Make a QR code for a link' }).click()
  await panel.getByLabel('Link or text').fill('https://example.com/menu')
  await panel.getByRole('button', { name: 'Add QR code' }).click()
  await expect.poll(async () => (await elements(page)).length).toBe(2)
  const qr = (await elements(page))[1]
  expect(qr).toMatchObject({ type: 'svg', kind: 'qr', qr: { value: 'https://example.com/menu' } })

  // it's selected once added; edit it again from the toolbar
  expect(await selection(page)).toEqual([qr.id])
  await selectionToolbar(page).getByRole('button', { name: 'Edit QR code' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Link or text').fill('https://example.com/menu?table=4')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()
  await expect.poll(async () => ((await elements(page))[1].qr as { value: string }).value).toBe('https://example.com/menu?table=4')
})
