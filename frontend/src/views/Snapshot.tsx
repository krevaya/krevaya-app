import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { DesignDoc } from '@/doc/schema'
import { ensureFontCatalog, loadDesignFonts } from '@/editor/fonts'
import { renderPageCanvas } from '@/export/raster'

declare global {
  interface Window {
    snapshotReady?: boolean
  }
}

/**
 * Bare page the server-side exporter screenshots with a headless browser.
 * Each design page is drawn into an element marked data-snapshot-page="<index>".
 */
export default function Snapshot({ id }: { id: string }) {
  const [pages, setPages] = useState<Array<{ src: string; w: number; h: number }>>([])
  const [error, setError] = useState('')

  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const token = q.get('token') ?? ''
    const scale = Math.min(4, Math.max(0.1, Number(q.get('scale')) || 1))
    const only = q.get('all') ? null : Number(q.get('page') ?? 0)
    ;(async () => {
      await Promise.all([ensureFontCatalog(), loadDesignFonts(id, { 'x-snapshot-token': token })])
      const d = await api<{ doc: DesignDoc }>(`/api/designs/${id}`, { headers: { 'x-snapshot-token': token } })
      const out = []
      for (const [i, page] of d.doc.pages.entries()) {
        if (only !== null && i !== only) {
          out.push({ src: '', w: 0, h: 0 })
          continue
        }
        const canvas = await renderPageCanvas(page, scale)
        out.push({ src: canvas.toDataURL('image/png'), w: page.width * scale, h: page.height * scale })
      }
      setPages(out)
    })().catch((e: Error) => setError(e.message))
  }, [id])

  useEffect(() => {
    if (!pages.length) return
    const imgs = [...document.querySelectorAll<HTMLImageElement>('[data-snapshot-page] img')]
    Promise.all(imgs.map((img) => img.decode().catch(() => {}))).then(() => {
      window.snapshotReady = true
    })
  }, [pages])

  if (error) return <p>{error}</p>
  return (
    <div style={{ margin: 0, background: '#fff' }}>
      <style>{'@page { margin: 0 } body { margin: 0 } [data-snapshot-page] { break-after: page }'}</style>
      {pages.map((p, i) =>
        p.src ? (
          <div key={i} data-snapshot-page={i} style={{ width: p.w, height: p.h, overflow: 'hidden' }}>
            <img src={p.src} width={p.w} height={p.h} alt="" style={{ display: 'block' }} />
          </div>
        ) : null,
      )}
    </div>
  )
}
