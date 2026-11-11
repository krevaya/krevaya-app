import { addOverlay } from '@/editor/canvas/hooks'
import { setPasteHandler } from '@/editor/useShortcuts'
import { canEdit, useEditor } from '@/stores/editor'
import { CropOverlay } from './CropOverlay'
import { DropLayer } from './DropLayer'
import { addFiles, isImageFile } from './media'
import { busyToast, Toasts } from './toast'

addOverlay(CropOverlay)
addOverlay(DropLayer)
addOverlay(Toasts)

setPasteHandler((e) => {
  if (!canEdit(useEditor.getState().role)) return false
  const files = Array.from(e.clipboardData?.items ?? [])
    .filter((i) => i.kind === 'file')
    .map((i) => i.getAsFile())
    .filter((f): f is File => !!f && isImageFile(f))
  if (!files.length) return false
  e.preventDefault()
  const t = busyToast('Adding your image')
  void addFiles(files).then((err) => t.done(err ?? undefined))
  return true
})
