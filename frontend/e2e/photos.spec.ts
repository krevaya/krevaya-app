import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { elements, newGuestDesign, openTool, selectionToolbar } from './helpers'

const PHOTO = fileURLToPath(new URL('./fixtures/photo.jpg', import.meta.url))

test('upload a photo, crop it, filter it and remove its background', async ({ page }) => {
  test.slow() // background removal runs a model in the browser
  await newGuestDesign(page, 'Instagram post')

  const uploads = await openTool(page, 'Uploads')
  await uploads.locator('input[type="file"]').setInputFiles(PHOTO)
  const tile = uploads.getByRole('button', { name: 'photo.jpg', exact: true })
  await tile.click()
  await expect.poll(async () => (await elements(page)).length).toBe(1)
  const img = (await elements(page))[0]
  expect(img).toMatchObject({ type: 'image', naturalWidth: 480, naturalHeight: 320 })
  expect(String(img.src)).toMatch(/^local:/)
  const el = async () => (await elements(page))[0]

  // crop to a square
  await selectionToolbar(page).getByRole('button', { name: 'Crop' }).click()
  const crop = page.getByRole('toolbar', { name: 'Crop' })
  await crop.getByRole('button', { name: '1:1' }).click()
  await expect(crop.getByRole('button', { name: '1:1' })).toHaveAttribute('aria-pressed', 'true')
  await crop.getByRole('button', { name: 'Done' }).click()
  await expect(crop).toBeHidden()
  await expect.poll(async () => (await el()).crop).toBeTruthy()
  const cropped = await el()
  expect(Math.abs(cropped.width - cropped.height)).toBeLessThan(2)
  const c = cropped.crop as { width: number; height: number }
  expect(Math.abs(c.width - c.height)).toBeLessThan(2)
  expect(c.height).toBeLessThanOrEqual(320)

  await selectionToolbar(page).getByRole('button', { name: 'Edit photo' }).click()
  const panel = page.getByRole('complementary', { name: 'Photo' })
  await panel.getByRole('button', { name: 'Punch' }).click()
  await expect.poll(async () => (await el()).filters).toEqual({ preset: 'punch', saturation: 32, contrast: 24, temperature: 5 })
  await expect(panel.getByRole('button', { name: 'Punch' })).toHaveAttribute('aria-pressed', 'true')

  await panel.getByRole('button', { name: 'Remove background' }).click()
  await expect.poll(async () => (await el()).src, { timeout: 90_000 }).not.toBe(img.src)
  await expect(panel.getByRole('button', { name: 'Remove background' })).toBeEnabled()
  const done = await el()
  expect(String(done.src)).toMatch(/^local:/)
  // the crop and filters carry over to the new file
  expect(done.filters).toMatchObject({ preset: 'punch' })
  expect(done.crop).toBeTruthy()
  await expect(page.getByText('Something went wrong with that photo')).toHaveCount(0)

  const uploads2 = await openTool(page, 'Uploads')
  const tiles = uploads2.locator('button[draggable="true"]')
  await expect(tiles).toHaveCount(2)
  // the cut-out has a see-through background: check a corner pixel of its preview
  const alpha = await tiles.locator('img').evaluateAll(async (imgs) => {
    const out: number[] = []
    for (const img of imgs as HTMLImageElement[]) {
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      out.push(ctx.getImageData(2, 2, 1, 1).data[3])
    }
    return out
  })
  expect(alpha.sort()).toEqual([0, 255])
})
