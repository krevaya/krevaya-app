import { expect, test } from '@playwright/test'
import { signUp } from './helpers'

const text = (id: string, slot: string, value: string, y: number) => ({
  id, type: 'text', slot, x: 80, y, width: 900, height: 120, rotation: 0, opacity: 1,
  text: value, fontFamily: 'Inter', fontSize: 80, fontWeight: 700, align: 'left', lineHeight: 1.2,
  letterSpacing: 0, color: '#16131f',
})

test('API token from Settings works for designs and slot copies', async ({ page, request }) => {
  await signUp(page.request)
  await page.goto('/settings')
  await page.getByRole('textbox', { name: 'Token name' }).fill('Laptop script')
  await page.getByRole('button', { name: 'Create token' }).click()
  await expect(page.getByText("Copy your new token now. You won't see it again.")).toBeVisible()
  const token = (await page.locator('code').filter({ hasText: /^ka_[^…]+$/ }).textContent())!.trim()
  expect(token).toMatch(/^ka_/)
  await expect(page.getByText('Laptop script')).toBeVisible()

  // the request fixture has no cookies, so only the token signs these in
  const auth = { Authorization: `Bearer ${token}` }
  expect((await request.get('/api/designs')).status()).toBe(401)
  expect((await request.get('/api/designs', { headers: { Authorization: 'Bearer ka_nope' } })).status()).toBe(401)

  const created = await request.post('/api/designs', {
    headers: auth,
    data: {
      title: 'Name badge',
      doc: {
        pages: [{
          id: 'p1', width: 1080, height: 1080, background: { type: 'solid', color: '#ffffff' },
          elements: [text('t1', 'name', 'Your name', 200), text('t2', 'role', 'Your role', 400)],
        }],
        settings: {},
      },
    },
  })
  expect(created.ok(), await created.text()).toBeTruthy()
  const source = await created.json()

  const list = await request.get('/api/designs', { headers: auth })
  expect(list.ok()).toBeTruthy()
  expect((await list.json()).designs.map((d: { id: string }) => d.id)).toContain(source.id)

  const slots = await (await request.get(`/api/designs/${source.id}/slots`, { headers: auth })).json()
  expect(slots.slots).toEqual(expect.arrayContaining([{ name: 'name', type: 'text' }, { name: 'role', type: 'text' }]))

  const filled = await request.post(`/api/designs/${source.id}/copies`, {
    headers: auth,
    data: { title: 'Ana badge', rows: [{ name: 'Ana', role: 'Designer' }] },
  })
  expect(filled.ok(), await filled.text()).toBeTruthy()
  const one = (await filled.json()).made[0]
  expect(one.title).toBe('Ana badge')
  const doc = (await (await request.get(`/api/designs/${one.id}`, { headers: auth })).json()).doc
  expect(doc.pages[0].elements.map((e: { text: string }) => e.text)).toEqual(['Ana', 'Designer'])

  const bulk = await request.post(`/api/designs/${source.id}/copies`, {
    headers: auth,
    data: { title_from: 'name', rows: [{ name: 'Sam', role: 'Engineer' }, { name: 'Kai', role: 'Writer' }] },
  })
  expect(bulk.ok(), await bulk.text()).toBeTruthy()
  const out = await bulk.json()
  expect(out.failed).toEqual([])
  expect(out.made.map((d: { title: string }) => d.title)).toEqual(['Sam', 'Kai'])
  const kai = (await (await request.get(`/api/designs/${out.made[1].id}`, { headers: auth })).json()).doc
  expect(kai.pages[0].elements.map((e: { text: string }) => e.text)).toEqual(['Kai', 'Writer'])

  // the source stays as it was, and everything shows up on the dashboard
  const src = (await (await request.get(`/api/designs/${source.id}`, { headers: auth })).json()).doc
  expect(src.pages[0].elements[0].text).toBe('Your name')
  await page.goto('/designs')
  for (const title of ['Name badge', 'Ana badge', 'Sam', 'Kai']) {
    await expect(page.locator('main div.group').filter({ has: page.getByText(title, { exact: true }) })).toHaveCount(1)
  }

  // deleting the token turns it off
  await page.goto('/settings')
  page.once('dialog', (d) => void d.accept())
  await page.getByRole('button', { name: 'Delete Laptop script' }).click()
  await expect(page.getByText('No tokens yet.')).toBeVisible()
  expect((await request.get('/api/designs', { headers: auth })).status()).toBe(401)
})
