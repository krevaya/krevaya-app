import type { Page } from '@/doc/schema'
import { abortError, nextFrame, pageDpi, pageInches } from '@/export/paper'
import { blobFromCanvas, renderPageCanvas } from '@/export/raster'

// Printing goes through a hidden iframe holding one image per sheet, with a
// named @page per paper size so mixed-size designs still print right.

const PRINT_DPI = 300
const MAX_PIXELS = 24e6

const inch = (v: number) => `${Math.round(v * 1000) / 1000}in`

export async function printPages(pages: Page[], title: string, opts: { onProgress?: (f: number) => void; signal?: AbortSignal } = {}) {
  const urls: string[] = []
  const sheets: Array<{ url: string; w: number; h: number }> = []
  try {
    for (let i = 0; i < pages.length; i++) {
      if (opts.signal?.aborted) throw abortError()
      const page = pages[i]
      const scale = Math.min(PRINT_DPI / pageDpi(page), Math.sqrt(MAX_PIXELS / (page.width * page.height)))
      const canvas = await renderPageCanvas(page, scale)
      const blob = await blobFromCanvas(canvas, 'image/png')
      canvas.width = canvas.height = 0
      const url = URL.createObjectURL(blob)
      urls.push(url)
      const size = pageInches(page)
      sheets.push({ url, w: size.width, h: size.height })
      opts.onProgress?.((i + 1) / pages.length)
      await nextFrame()
    }
  } catch (e) {
    urls.forEach((u) => URL.revokeObjectURL(u))
    throw e
  }
  if (opts.signal?.aborted) {
    urls.forEach((u) => URL.revokeObjectURL(u))
    throw abortError()
  }

  const sizes = [...new Set(sheets.map((s) => `${inch(s.w)} ${inch(s.h)}`))]
  const css = [
    '@page { margin: 0 }',
    ...sizes.map((s, i) => `@page size${i} { size: ${s}; margin: 0 }`),
    'html, body { margin: 0; padding: 0; background: #fff }',
    '* { -webkit-print-color-adjust: exact; print-color-adjust: exact }',
    '.sheet { overflow: hidden; break-after: page; page-break-after: always }',
    '.sheet:last-child { break-after: auto; page-break-after: auto }',
    '.sheet img { display: block; width: 100%; height: 100% }',
    '@media screen { .sheet { margin: 0 auto 16px; box-shadow: 0 0 0 1px #ddd } }',
  ].join('\n')
  const body = sheets
    .map((s) => {
      const size = `${inch(s.w)} ${inch(s.h)}`
      return `<div class="sheet" style="page: size${sizes.indexOf(size)}; width: ${inch(s.w)}; height: ${inch(s.h)}"><img src="${s.url}" alt=""></div>`
    })
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/[<&]/g, '')}</title><style>${css}</style></head><body>${body}</body></html>`

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.dataset.print = 'krevaya-app'
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden'
  document.body.appendChild(frame)
  const cleanup = () => {
    frame.remove()
    urls.forEach((u) => URL.revokeObjectURL(u))
  }
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve()
    frame.srcdoc = html
  })
  const win = frame.contentWindow
  if (!win) {
    cleanup()
    throw new Error('Printing is blocked in this browser.')
  }
  await Promise.all(Array.from(win.document.images).map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => {}))))
  // print() blocks in most browsers; afterprint covers the ones where it doesn't
  let done = false
  const finish = () => {
    if (done) return
    done = true
    setTimeout(cleanup, 1000)
  }
  win.addEventListener('afterprint', finish)
  win.focus()
  win.print()
  setTimeout(finish, 60_000)
}
