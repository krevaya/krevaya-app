import { enlarge } from './enlarge'

export type EnlargeRequest = { id: number; bitmap: ImageBitmap; factor: number }
export type EnlargeReply =
  | { id: number; type: 'progress'; progress: number }
  | { id: number; type: 'done'; blob: Blob; width: number; height: number }
  | { id: number; type: 'error'; message: string }

self.onmessage = async (e: MessageEvent<EnlargeRequest>) => {
  const { id, bitmap, factor } = e.data
  const post = (m: EnlargeReply) => (self as unknown as Worker).postMessage(m)
  try {
    const c = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const src = ctx.getImageData(0, 0, c.width, c.height)
    const out = enlarge(src, Math.round(c.width * factor), Math.round(c.height * factor), {
      progress: (p) => post({ id, type: 'progress', progress: p * 0.9 }),
    })
    let opaque = true
    for (let i = 3; i < out.data.length; i += 4) if (out.data[i] !== 255) { opaque = false; break }
    const oc = new OffscreenCanvas(out.width, out.height)
    oc.getContext('2d')!.putImageData(new ImageData(out.data, out.width, out.height), 0, 0)
    const blob = await oc.convertToBlob(opaque ? { type: 'image/jpeg', quality: 0.93 } : { type: 'image/png' })
    post({ id, type: 'done', blob, width: out.width, height: out.height })
  } catch (err) {
    post({ id, type: 'error', message: (err as Error)?.message ?? String(err) })
  }
}
