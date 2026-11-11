import { useEffect, useState } from 'react'
import type { OverlayProps } from '@/editor/canvas/hooks'
import { currentPage } from '@/editor/actions'
import { canEdit, useEditor } from '@/stores/editor'
import { addFiles, dropTarget, PHOTO_MIME, placePhoto, type PhotoDrag } from './media'
import { toast } from './toast'

function carriesPhoto(dt: DataTransfer | null) {
  if (!dt) return false
  const types = Array.from(dt.types)
  return types.includes(PHOTO_MIME) || types.includes('Files')
}

/** Files and photo tiles dropped on the canvas land where they were dropped. */
export function DropLayer({ engine }: OverlayProps) {
  const [hover, setHover] = useState<{ x: number; y: number; w: number; h: number; rot: number } | null>(null)

  useEffect(() => {
    const host = engine.stage.container()
    const pagePoint = (e: DragEvent) => {
      const r = host.getBoundingClientRect()
      return engine.toPage(e.clientX - r.left, e.clientY - r.top)
    }
    const over = (e: DragEvent) => {
      if (!canEdit(useEditor.getState().role) || !carriesPhoto(e.dataTransfer)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
      const page = currentPage()
      const p = pagePoint(e)
      const t = page ? dropTarget(page, p.x, p.y) : null
      if (!t) return setHover(null)
      const b = engine.screenBox(t)
      setHover({ x: b.x, y: b.y, w: b.width, h: b.height, rot: t.rotation || 0 })
    }
    const leave = (e: DragEvent) => {
      if (!host.contains(e.relatedTarget as Node | null)) setHover(null)
    }
    const drop = (e: DragEvent) => {
      setHover(null)
      if (!canEdit(useEditor.getState().role) || !e.dataTransfer) return
      const p = pagePoint(e)
      const raw = e.dataTransfer.getData(PHOTO_MIME)
      if (raw) {
        e.preventDefault()
        try {
          placePhoto(JSON.parse(raw) as PhotoDrag, p)
        } catch {
          // not ours
        }
        return
      }
      const files = Array.from(e.dataTransfer.files)
      if (!files.length) return
      e.preventDefault()
      void addFiles(files, p).then((err) => err && toast(err))
    }
    host.addEventListener('dragover', over)
    host.addEventListener('dragleave', leave)
    host.addEventListener('drop', drop)
    return () => {
      host.removeEventListener('dragover', over)
      host.removeEventListener('dragleave', leave)
      host.removeEventListener('drop', drop)
    }
  }, [engine])

  if (!hover) return null
  return (
    <div
      className="absolute pointer-events-none z-[5] rounded-sm"
      style={{
        left: hover.x, top: hover.y, width: hover.w, height: hover.h,
        transform: `rotate(${hover.rot}deg)`, transformOrigin: '0 0',
        outline: '2px solid #612bd3', background: 'rgba(97,43,211,0.12)',
      }}
    />
  )
}
