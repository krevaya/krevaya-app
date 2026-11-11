import { expect, test } from '@playwright/test'
import { unzipSync } from 'fflate'

test('guests can read the notices and get the matching media library source', async ({ page, request }) => {
  await page.goto('/settings')
  const link = page.getByRole('link', { name: 'Read the licenses and credits' })
  await expect(link).toHaveAttribute('href', '/licenses/')
  const popup = page.waitForEvent('popup')
  await link.click()
  const notices = await popup
  await expect(notices.getByRole('heading', { name: 'Licenses and credits', exact: true })).toBeVisible()
  await notices.getByRole('link', { name: 'roboto-mono', exact: true }).click()
  await expect(notices.locator('body')).toContainText('SIL OPEN FONT LICENSE')

  const model = await request.get('/models/LICENSE.txt')
  expect(model.ok()).toBe(true)
  expect(await model.text()).toContain('Apache License')
  const deps = await request.get('/licenses/dependencies.txt')
  expect(deps.ok()).toBe(true)
  expect(await deps.text()).toContain('Mozilla Public License Version 2.0')
  expect(await deps.text()).toContain('Microsoft Corporation')

  const source = await request.get('/licenses/mediabunny-source.zip')
  expect(source.ok()).toBe(true)
  const files = unzipSync(new Uint8Array(await source.body()))
  const manifest = Object.keys(files).find((f) => f.endsWith('/package.json'))!
  const pkg = JSON.parse(new TextDecoder().decode(files[manifest]))
  expect(pkg.name).toBe('mediabunny')
  expect(pkg.license).toBe('MPL-2.0')
  expect(Object.keys(files)).toContain(`mediabunny-${pkg.version}/src/index.ts`)
})
