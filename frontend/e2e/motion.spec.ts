import { expect, test } from '@playwright/test'
import { insertHeadline, clickBlank, elements, newGuestDesign, openTool, pages, selectionToolbar } from './helpers'

test('animate an element and preview it', async ({ page }) => {
  await newGuestDesign(page, 'Presentation')
  const heading = await insertHeadline(page)
  await selectionToolbar(page).getByRole('button', { name: 'Animate' }).click()
  const panel = page.getByRole('complementary', { name: 'Animate' })
  await panel.getByRole('button', { name: 'Rise', exact: true }).click()
  await expect.poll(async () => (await elements(page))[0].anim).toEqual({ enter: { name: 'rise' } })
  await expect(panel.getByRole('button', { name: 'Rise', exact: true })).toHaveAttribute('aria-pressed', 'true')

  // emphasis goes in its own slot
  await panel.getByRole('tab', { name: 'Emphasis' }).click()
  await panel.getByRole('button', { name: 'Pulse', exact: true }).click()
  await expect.poll(async () => (await elements(page))[0].anim).toMatchObject({ enter: { name: 'rise' }, emphasis: { name: 'pulse' } })

  // the preview draws the element part-way through its animation
  await panel.getByRole('button', { name: 'Play page' }).click()
  await expect(panel.getByRole('button', { name: 'Stop' })).toBeVisible()
  await expect
    .poll(() => page.evaluate((id) => {
      // each element is outer group > motion group > content; the motion group carries the animation
      const motion = (window as any).__ka.engine().stage.findOne('#' + id)?.getChildren()[0]
      return !!motion && (motion.opacity() < 1 || Math.abs(motion.scaleX() - 1) > 0.001)
    }, heading.id))
    .toBe(true)
  await panel.getByRole('button', { name: 'Stop' }).click()
  await expect(panel.getByRole('button', { name: 'Play page' })).toBeVisible()

  await clickBlank(page)
  const pagePanel = await openTool(page, 'Animate')
  await expect(pagePanel.getByText('Page 1 duration')).toBeVisible()

  // page changes are grouped by family and can be cleared again
  await expect(pagePanel.getByText('Reveal', { exact: true })).toBeVisible()
  await pagePanel.getByRole('button', { name: 'Push left', exact: true }).click()
  await expect.poll(async () => ((await pages(page))[0] as { transition?: { name: string } }).transition?.name).toBe('push-left')
  await pagePanel.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect.poll(async () => ((await pages(page))[0] as { transition?: unknown }).transition ?? null).toBeNull()
})

test('present mode opens, steps through pages and closes', async ({ page }) => {
  await newGuestDesign(page, 'Presentation')
  await insertHeadline(page)
  await page.getByRole('button', { name: 'Add page' }).click()
  await page.getByRole('button', { name: 'Add page' }).click()
  await expect(page.getByText('Page 3 / 3')).toBeVisible()
  // the show starts from the page you're on
  await page.getByRole('button', { name: 'Previous page' }).click()
  await page.getByRole('button', { name: 'Previous page' }).click()
  await expect(page.getByText('Page 1 / 3')).toBeVisible()

  await page.getByRole('button', { name: 'Present', exact: true }).click()
  const show = page.getByRole('dialog', { name: 'Presentation' })
  await expect(show).toBeVisible()
  await expect(show.getByText('1 / 3')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(show.getByText('2 / 3')).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await expect(show.getByText('3 / 3')).toBeVisible()
  await page.keyboard.press('ArrowLeft')
  await expect(show.getByText('2 / 3')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(show).toBeHidden()
  // the editor is still usable afterward
  await expect(page.getByRole('main', { name: 'Canvas' })).toBeVisible()
})
