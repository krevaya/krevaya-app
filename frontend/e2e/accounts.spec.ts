import { expect, test } from '@playwright/test'
import { PASSWORD, insertHeadline, elements, newGuestDesign, uniqueEmail, waitForEditor, waitForGuestSave } from './helpers'

// Runs first, on a fresh server (see playwright.config.ts), so this sign-up is the first account.
test('sign up, sign out, sign in, and bring guest designs along', async ({ page }) => {
  const email = uniqueEmail('admin')

  // something made as a guest, to move into the account later
  await newGuestDesign(page, 'Story')
  const heading = await insertHeadline(page)
  await page.getByTitle('Rename').click()
  await page.getByRole('textbox', { name: 'Design title' }).fill('Guest story')
  await page.getByRole('textbox', { name: 'Design title' }).press('Enter')
  await waitForGuestSave(page)

  await page.goto('/signup')
  await page.getByLabel('Name').fill('Ada')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL((u) => u.pathname === '/')
  await expect(page.getByRole('banner').getByText(email)).toBeVisible()

  const me = await (await page.request.get('/api/auth/me')).json()
  expect(me.user).toMatchObject({ email, is_admin: true })

  // the banner offers to move the guest design over
  await expect(page.getByText(/1 guest design is still sitting on this device/)).toBeVisible()
  await page.getByRole('button', { name: 'Move designs' }).click()
  await page.waitForURL('**/designs')
  const card = page.locator('main div.group').filter({ hasText: 'Guest story' })
  await expect(card).toHaveCount(1)
  await card.getByRole('button').first().click()
  await page.waitForURL(/\/design\//)
  await waitForEditor(page)
  const els = await elements(page)
  expect(els).toHaveLength(1)
  expect(els[0].text).toBe(heading.text)
  // admins can turn designs into templates
  await page.getByRole('button', { name: 'File' }).click()
  await expect(page.getByRole('menuitem', { name: 'Save as template…' })).toBeVisible()
  await page.keyboard.press('Escape')

  await page.goto('/settings')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL((u) => u.pathname === '/')
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in' })).toBeVisible()

  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill('wrong-guess-77')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toHaveText('Wrong email or password')

  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((u) => u.pathname === '/')
  await expect(page.getByRole('banner').getByText(email)).toBeVisible()
  await expect(page.getByText(/still sitting on this device/)).toBeHidden()
})

test('a second account is not an admin', async ({ request }) => {
  const res = await request.post('/api/auth/signup', { data: { email: uniqueEmail('second'), password: PASSWORD, name: 'Bo' } })
  expect(res.ok()).toBeTruthy()
  expect((await res.json()).is_admin).toBe(false)
})
