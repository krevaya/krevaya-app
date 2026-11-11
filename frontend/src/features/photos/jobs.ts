import { create } from 'zustand'
import type { ImageElement } from '@/doc/schema'
import { updateElement } from '@/editor/actions'
import { loadImage } from '@/render/assets'
import { useEditor } from '@/stores/editor'
import type { BgMessage, BgRequest } from './bgremove.worker'
import { sourceBlob, storeImage } from './media'
import { busyToast } from './toast'
import type { EnlargeReply, EnlargeRequest } from './enlarge.worker'

// Background removal and enlarging run in workers; the result is stored like an
// upload and swapped into the element.

export const MODEL_URL = '/models/u2netp.onnx'
/** Largest enlarged image we make, in pixels. */
export const MAX_ENLARGED_PIXELS = 24e6
export const MAX_ENLARGED_SIDE = 8000

type Job = { kind: 'bg' | 'enlarge'; label: string; progress?: number }
export const useJobs = create<Record<string, Job>>(() => ({}))

function setJob(id: string, job: Job | null) {
  useJobs.setState((s) => {
    const next = { ...s }
    if (job) next[id] = job
    else delete next[id]
    return next
  }, true)
}

export class FriendlyError extends Error {}

let bgWorker: Worker | null = null
let seq = 0

function runBg(bitmap: ImageBitmap, onStage: (stage: string, p?: number) => void) {
  bgWorker ??= new Worker(new URL('./bgremove.worker.ts', import.meta.url), { type: 'module' })
  const w = bgWorker
  const id = ++seq
  return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
    const onMsg = (e: MessageEvent<BgMessage>) => {
      const m = e.data
      if (m.id !== id) return
      if (m.type === 'progress') return onStage(m.stage, m.progress)
      w.removeEventListener('message', onMsg)
      w.removeEventListener('error', onErr)
      if (m.type === 'done') resolve(m)
      else if (m.code === 'missing-model') {
        reject(new FriendlyError("Remove background needs its model file, and frontend/public/models/u2netp.onnx is missing. Restore it from the repository and rebuild."))
      } else reject(new Error(m.message))
    }
    const onErr = (e: ErrorEvent) => {
      w.removeEventListener('message', onMsg)
      w.removeEventListener('error', onErr)
      bgWorker?.terminate()
      bgWorker = null
      reject(new Error(e.message || 'worker failed'))
    }
    w.addEventListener('message', onMsg)
    w.addEventListener('error', onErr)
    w.postMessage({ id, bitmap, modelUrl: MODEL_URL, maxSide: 4096 } satisfies BgRequest, [bitmap])
  })
}

function runEnlarge(bitmap: ImageBitmap, factor: number, onProgress: (p: number) => void) {
  const w = new Worker(new URL('./enlarge.worker.ts', import.meta.url), { type: 'module' })
  const id = ++seq
  return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) => {
    w.onmessage = (e: MessageEvent<EnlargeReply>) => {
      const m = e.data
      if (m.type === 'progress') return onProgress(m.progress)
      w.terminate()
      if (m.type === 'done') resolve(m)
      else reject(new Error(m.message))
    }
    w.onerror = (e) => {
      w.terminate()
      reject(new Error(e.message || 'worker failed'))
    }
    w.postMessage({ id, bitmap, factor } satisfies EnlargeRequest, [bitmap])
  })
}

function baseName(src: string) {
  const tail = src.split(/[/?#]/).filter(Boolean).pop() ?? 'photo'
  return tail.replace(/^local:/, '').replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'photo'
}

/** Swap in a new file, scaling the crop by how much the pixel size changed. */
function swapSource(elId: string, src: string, width: number, height: number, srcW: number, srcH: number, assetId?: string) {
  const cur = useEditor.getState().doc?.element(elId)
  if (!cur || cur.type !== 'image') return
  const kx = width / srcW
  const ky = height / srcH
  const crop = cur.crop && { x: cur.crop.x * kx, y: cur.crop.y * ky, width: cur.crop.width * kx, height: cur.crop.height * ky }
  useEditor.getState().doc?.breakUndo()
  updateElement(elId, { src, assetId, naturalWidth: width, naturalHeight: height, crop } as Partial<ImageElement>)
}

async function process(
  el: ImageElement,
  job: Job,
  run: (bitmap: ImageBitmap, progress: (label: string | null, p?: number) => void) => Promise<{ blob: Blob; width: number; height: number }>,
  suffix: string,
) {
  if (useJobs.getState()[el.id]) return
  const t = busyToast(job.label)
  const progress = (label: string | null, p?: number) => {
    const next = { ...job, label: label ?? job.label, progress: p }
    setJob(el.id, next)
    t.update({ text: next.label, progress: p })
  }
  setJob(el.id, job)
  try {
    const blob = await sourceBlob(el.src).catch(() => {
      throw new FriendlyError("Couldn't read this photo. It may be hosted somewhere that doesn't allow editing.")
    })
    const bitmap = await createImageBitmap(blob)
    const srcW = bitmap.width
    const srcH = bitmap.height
    const out = await run(bitmap, progress)
    progress('Saving')
    const ext = out.blob.type === 'image/png' ? 'png' : 'jpg'
    const stored = await storeImage(out.blob, `${baseName(el.src)}-${suffix}.${ext}`)
    await loadImage(stored.src).catch(() => {})
    swapSource(el.id, stored.src, out.width, out.height, srcW, srcH, stored.assetId)
    t.done()
  } catch (e) {
    t.done(e instanceof FriendlyError ? e.message : 'Something went wrong with that photo. Try again, or try a smaller image.')
    if (!(e instanceof FriendlyError)) console.error(e)
  } finally {
    setJob(el.id, null)
  }
}

const BG_STAGES: Record<string, string> = {
  model: 'Getting the background remover ready',
  detect: 'Finding the subject',
  refine: 'Cleaning up the edges',
  encode: 'Almost done',
}

export function cutOutSubject(el: ImageElement) {
  return process(el, { kind: 'bg', label: 'Removing background' }, (bitmap, progress) =>
    runBg(bitmap, (stage, p) => progress(BG_STAGES[stage] ?? null, p)), 'no-bg')
}

export function enlargePhoto(el: ImageElement, factor: number) {
  return process(el, { kind: 'enlarge', label: `Enlarging ${factor}x` }, (bitmap, progress) =>
    runEnlarge(bitmap, factor, (p) => progress(null, p)), `${factor}x`)
}

/** Whether enlarging by this factor stays under the size limits. */
export function canEnlarge(w: number, h: number, factor: number) {
  return w * h * factor * factor <= MAX_ENLARGED_PIXELS && Math.max(w, h) * factor <= MAX_ENLARGED_SIDE
}
