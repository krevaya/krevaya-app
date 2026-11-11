import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { PNG } from 'pngjs'
import { insertHeadline, addShape, newGuestDesign, openTool, pages } from './helpers'

/** Pick a file type in the Download dialog, download, and return the file. */
async function download(page: Page, kind: string, pagesMode?: string) {
  await page.getByRole('button', { name: 'Download', exact: true }).last().click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('button[aria-haspopup="listbox"]').click()
  await page.getByRole('option', { name: new RegExp(`^${kind}`) }).click()
  await expect(dialog.getByText(`${kind} selected`)).toBeAttached()
  if (pagesMode) await dialog.getByRole('tab', { name: pagesMode }).click()
  const [file] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    dialog.getByRole('button', { name: /^Download/ }).click(),
  ])
  await expect(dialog).toBeHidden({ timeout: 60_000 })
  return { name: file.suggestedFilename(), data: await readFile((await file.path())!) }
}

function jpegSize(buf: Buffer) {
  let i = 2
  while (i < buf.length) {
    const marker = buf[i + 1]
    const len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    i += 2 + len
  }
  return null
}

test.describe('downloads', () => {
  test.describe.configure({ mode: 'serial' })
  let page: Page

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage({ acceptDownloads: true })
    await newGuestDesign(page, 'Instagram post')
    await insertHeadline(page)
    await addShape(page, 'Heart')
    await page.getByTitle('Rename').click()
    await page.getByRole('textbox', { name: 'Design title' }).fill('Export check')
    await page.getByRole('textbox', { name: 'Design title' }).press('Enter')
  })
  test.afterAll(async () => {
    await page.close()
  })

  test('PNG', async () => {
    const f = await download(page, 'PNG')
    expect(f.name).toBe('Export check.png')
    const png = PNG.sync.read(f.data)
    expect([png.width, png.height]).toEqual([1080, 1350])
    // top-left corner is the white page background
    expect([...png.data.subarray(0, 4)]).toEqual([255, 255, 255, 255])
  })

  test('JPG', async () => {
    const f = await download(page, 'JPG')
    expect(f.name).toBe('Export check.jpg')
    expect([...f.data.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
    expect(jpegSize(f.data)).toEqual({ width: 1080, height: 1350 })
  })

  test('SVG', async () => {
    const f = await download(page, 'SVG')
    expect(f.name).toBe('Export check.svg')
    const svg = f.data.toString('utf8')
    expect(svg).toMatch(/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
    expect(svg).toMatch(/viewBox="0 0 1080 1350"/)
    expect(svg).toContain('<text')
    // it parses as XML in the browser too
    const ok = await page.evaluate((s) => !new DOMParser().parseFromString(s, 'image/svg+xml').querySelector('parsererror'), svg)
    expect(ok).toBe(true)
  })

  test('PDF with every page', async () => {
    await page.getByRole('button', { name: 'Add page' }).click()
    await expect(page.getByText('Page 2 / 2')).toBeVisible()
    const f = await download(page, 'PDF Standard', 'All pages (2)')
    expect(f.name).toBe('Export check.pdf')
    expect(f.data.subarray(0, 5).toString()).toBe('%PDF-')
    const pdf = await PDFDocument.load(f.data)
    expect(pdf.getPageCount()).toBe(2)
    const { width, height } = pdf.getPage(0).getSize()
    // a screen design is 96 px to the inch, 72 points to the inch
    expect(width).toBeCloseTo(810, 0)
    expect(height).toBeCloseTo(1012.5, 0)
  })

  test('GIF', async () => {
    // keep it short: one second per page
    const animate = await openTool(page, 'Animate')
    for (const p of await pages(page)) {
      await page.evaluate((id) => (window as any).__ka.editor.getState().setPage(id), p.id)
      await animate.getByRole('spinbutton', { name: 'Seconds' }).fill('1')
    }
    await expect.poll(async () => (await pages(page)).map((p) => p.duration)).toEqual([1000, 1000])
    const f = await download(page, 'GIF')
    expect(f.name).toBe('Export check.gif')
    expect(f.data.subarray(0, 6).toString()).toBe('GIF89a')
    expect(f.data.readUInt16LE(6)).toBeGreaterThan(0)
  })

  test('MP4', async () => {
    const avc = await page.evaluate(async () =>
      typeof VideoEncoder !== 'undefined' &&
      !!(await VideoEncoder.isConfigSupported({ codec: 'avc1.42001f', width: 1280, height: 720 })).supported,
    )
    test.skip(!avc, 'this browser has no H.264 encoder (WebCodecs)')
    const f = await download(page, 'MP4 video')
    expect(f.name).toBe('Export check.mp4')
    expect(f.data.subarray(4, 8).toString()).toBe('ftyp')
    expect(f.data.length).toBeGreaterThan(1000)
  })
})
