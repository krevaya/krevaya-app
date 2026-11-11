import * as ort from 'onnxruntime-web/wasm'
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url'

// Salient-object segmentation with U^2-Net small (u2netp, 320x320 input), the
// same pre/post-processing rembg uses, then a softened alpha mask at full size.

ort.env.wasm.wasmPaths = { wasm: wasmUrl }
// Threads need cross-origin isolation, which the app doesn't set up.
ort.env.wasm.numThreads = 1

const SIZE = 320
const MEAN = [0.485, 0.456, 0.406]
const STD = [0.229, 0.224, 0.225]

export type BgRequest = { id: number; bitmap: ImageBitmap; modelUrl: string; maxSide: number }
export type BgMessage =
  | { id: number; type: 'progress'; stage: string; progress?: number }
  | { id: number; type: 'done'; blob: Blob; width: number; height: number }
  | { id: number; type: 'error'; code: 'missing-model' | 'failed'; message: string }

let session: Promise<ort.InferenceSession> | null = null

class MissingModel extends Error {}

async function loadModel(url: string, progress: (p: number) => void): Promise<ort.InferenceSession> {
  const res = await fetch(url)
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || type.includes('text/html')) throw new MissingModel('model file not found')
  const total = Number(res.headers.get('content-length')) || 0
  let bytes: Uint8Array
  if (res.body && total) {
    const reader = res.body.getReader()
    bytes = new Uint8Array(total)
    let got = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (got + value.length > bytes.length) {
        const bigger = new Uint8Array(Math.max(bytes.length * 2, got + value.length))
        bigger.set(bytes)
        bytes = bigger
      }
      bytes.set(value, got)
      got += value.length
      progress(Math.min(1, got / total))
    }
    bytes = bytes.subarray(0, got)
  } else {
    bytes = new Uint8Array(await res.arrayBuffer())
  }
  if (bytes.length < 1000) throw new MissingModel('model file is empty')
  return ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' })
}

function pixels(bitmap: ImageBitmap, w: number, h: number): ImageData {
  const c = new OffscreenCanvas(w, h)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

function inputTensor(img: ImageData): ort.Tensor {
  const d = img.data
  const n = SIZE * SIZE
  let max = 1e-6
  for (let i = 0; i < d.length; i += 4) max = Math.max(max, d[i], d[i + 1], d[i + 2])
  const out = new Float32Array(3 * n)
  for (let p = 0; p < n; p++) {
    for (let c = 0; c < 3; c++) out[c * n + p] = (d[p * 4 + c] / max - MEAN[c]) / STD[c]
  }
  return new ort.Tensor('float32', out, [1, 3, SIZE, SIZE])
}

/** Bilinear upscale of the 320x320 mask to w x h. */
function upscaleMask(m: Float32Array, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h)
  const sx = SIZE / w
  const sy = SIZE / h
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(SIZE - 1, (y + 0.5) * sy - 0.5))
    const y0 = Math.floor(fy)
    const y1 = Math.min(SIZE - 1, y0 + 1)
    const ty = fy - y0
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, Math.min(SIZE - 1, (x + 0.5) * sx - 0.5))
      const x0 = Math.floor(fx)
      const x1 = Math.min(SIZE - 1, x0 + 1)
      const tx = fx - x0
      const a = m[y0 * SIZE + x0] * (1 - tx) + m[y0 * SIZE + x1] * tx
      const b = m[y1 * SIZE + x0] * (1 - tx) + m[y1 * SIZE + x1] * tx
      out[y * w + x] = a * (1 - ty) + b * ty
    }
  }
  return out
}

/** Separable box blur, in place. */
function boxBlur(m: Float32Array, w: number, h: number, r: number) {
  if (r < 1) return
  const tmp = new Float32Array(Math.max(w, h))
  const k = 1 / (2 * r + 1)
  for (let y = 0; y < h; y++) {
    const row = y * w
    let acc = 0
    for (let i = -r; i <= r; i++) acc += m[row + Math.min(w - 1, Math.max(0, i))]
    for (let x = 0; x < w; x++) {
      tmp[x] = acc * k
      acc += m[row + Math.min(w - 1, x + r + 1)] - m[row + Math.max(0, x - r)]
    }
    m.set(tmp.subarray(0, w), row)
  }
  for (let x = 0; x < w; x++) {
    let acc = 0
    for (let i = -r; i <= r; i++) acc += m[Math.min(h - 1, Math.max(0, i)) * w + x]
    for (let y = 0; y < h; y++) {
      tmp[y] = acc * k
      acc += m[Math.min(h - 1, y + r + 1) * w + x] - m[Math.max(0, y - r) * w + x]
    }
    for (let y = 0; y < h; y++) m[y * w + x] = tmp[y]
  }
}

self.onmessage = async (e: MessageEvent<BgRequest>) => {
  const { id, bitmap, modelUrl, maxSide } = e.data
  const post = (m: BgMessage) => (self as unknown as Worker).postMessage(m)
  try {
    if (!session) {
      post({ id, type: 'progress', stage: 'model', progress: 0 })
      session = loadModel(modelUrl, (p) => post({ id, type: 'progress', stage: 'model', progress: p }))
      session.catch(() => (session = null))
    }
    const s = await session
    post({ id, type: 'progress', stage: 'detect' })
    const small = pixels(bitmap, SIZE, SIZE)
    const out = await s.run({ [s.inputNames[0]]: inputTensor(small) })
    const pred = out[s.outputNames[0]].data as Float32Array
    // the first output holds 1x1x320x320; normalize like rembg does
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < SIZE * SIZE; i++) {
      lo = Math.min(lo, pred[i])
      hi = Math.max(hi, pred[i])
    }
    const span = hi - lo || 1
    const mask = new Float32Array(SIZE * SIZE)
    for (let i = 0; i < mask.length; i++) mask[i] = (pred[i] - lo) / span

    post({ id, type: 'progress', stage: 'refine' })
    const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * k))
    const h = Math.max(1, Math.round(bitmap.height * k))
    const full = pixels(bitmap, w, h)
    bitmap.close()
    const alpha = upscaleMask(mask, w, h)
    // a light feather that scales with the image, then firm up the middle so
    // faint haze drops out and solid areas stay solid
    boxBlur(alpha, w, h, Math.max(1, Math.round(Math.min(w, h) / 600)))
    const d = full.data
    for (let i = 0; i < alpha.length; i++) {
      let a = (alpha[i] - 0.06) / 0.88
      a = a <= 0 ? 0 : a >= 1 ? 1 : a * a * (3 - 2 * a)
      d[i * 4 + 3] = Math.round(d[i * 4 + 3] * a)
    }
    const c = new OffscreenCanvas(w, h)
    c.getContext('2d')!.putImageData(full, 0, 0)
    post({ id, type: 'progress', stage: 'encode' })
    const blob = await c.convertToBlob({ type: 'image/png' })
    post({ id, type: 'done', blob, width: w, height: h })
  } catch (err) {
    if (err instanceof MissingModel) post({ id, type: 'error', code: 'missing-model', message: err.message })
    else post({ id, type: 'error', code: 'failed', message: (err as Error)?.message ?? String(err) })
  }
}
