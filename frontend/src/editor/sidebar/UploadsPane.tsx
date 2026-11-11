import { Icon } from '@/components/icons'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, cx, Empty, Spinner } from '@/components/ui/kit'
import {
  deleteUpload, listUploads, onUploadsChanged, PHOTO_MIME, placePhoto, storeImage, storesLocally, isImageFile,
  type PhotoDrag, type Upload,
} from '@/features/photos/media'
import { MasonryGrid } from '@/features/photos/MasonryGrid'
import { useEditor } from '@/stores/editor'

export default function UploadsPane() {
  const input = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<Upload[] | null>(null)
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const guest = useEditor((s) => s.guest)
  const local = storesLocally()

  const refresh = useCallback(() => {
    listUploads()
      .then(setItems)
      .catch((e: Error) => {
        setItems([])
        setError(e.message || "Couldn't load your uploads.")
      })
  }, [])

  useEffect(() => {
    refresh()
    return onUploadsChanged(refresh)
  }, [refresh])

  const addFiles = async (files: File[]) => {
    const images = files.filter(isImageFile)
    setError(images.length < files.length ? 'Some files were skipped: only images can be uploaded here.' : null)
    if (!images.length) return
    setBusy((n) => n + images.length)
    for (const f of images) {
      try {
        await storeImage(f, f.name)
      } catch (e) {
        setError((e as Error).message || "That upload didn't work.")
      } finally {
        setBusy((n) => n - 1)
      }
    }
  }

  const remove = async (u: Upload) => {
    setItems((list) => list?.filter((x) => x.id !== u.id) ?? null)
    try {
      await deleteUpload(u)
    } catch (e) {
      setError((e as Error).message)
      refresh()
    }
  }

  return (
    <div
      className="flex flex-col min-h-full"
      onDragOver={(e) => {
        if (!Array.from(e.dataTransfer.types).includes('Files')) return
        e.preventDefault()
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        void addFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        multiple
        hidden
        onChange={(e) => {
          void addFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <Button variant="primary" className="w-full rounded-full" onClick={() => input.current?.click()} disabled={!guest && local}>
        <Icon name="upload" size={16} /> Upload files
      </Button>
      <div
        className={cx(
          'mt-3 rounded-tile border border-dashed px-4 py-5 text-center transition',
          over ? 'border-accent bg-accent-wash' : 'border-line-2 bg-surface-2',
        )}
      >
        <p className="text-[13px] text-ink-2">{over ? 'Drop to upload' : 'Drag photos here, or paste with ⌘V'}</p>
        <p className="text-[12px] text-muted mt-1">
          {guest ? 'Guest uploads stay on this device.' : !local ? 'PNG, JPG, WebP, GIF or SVG.' : 'Sign in to upload to this design.'}
        </p>
      </div>
      {error && <p className="text-[12px] text-danger mt-2" role="alert">{error}</p>}
      {busy > 0 && (
        <p className="text-[12px] text-muted mt-3 flex items-center gap-2"><Spinner /> Uploading {busy} {busy === 1 ? 'file' : 'files'}</p>
      )}
      <div className="mt-4">
        {items === null ? (
          <div className="py-8 flex justify-center"><Spinner /></div>
        ) : items.length === 0 ? (
          <Empty title="Nothing uploaded yet">Your photos and logos show up here so you can reuse them.</Empty>
        ) : (
          <MasonryGrid
            items={items}
            ratio={(u) => u.height / u.width}
            render={(u) => <UploadTile key={u.id} u={u} onDelete={() => void remove(u)} />}
          />
        )}
      </div>
    </div>
  )
}

function UploadTile({ u, onDelete }: { u: Upload; onDelete: () => void }) {
  const drag: PhotoDrag = { src: u.src, width: u.width, height: u.height, assetId: u.assetId }
  return (
    <div className="group relative rounded-tile overflow-hidden border border-line bg-surface-2 checker">
      <button
        className="block w-full"
        title={u.name}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(PHOTO_MIME, JSON.stringify(drag))
          e.dataTransfer.effectAllowed = 'copy'
        }}
        onClick={() => placePhoto(drag)}
      >
        <img src={u.thumb} alt={u.name} loading="lazy" className="block w-full h-auto" style={{ aspectRatio: `${u.width} / ${u.height}` }} />
      </button>
      <button
        onClick={onDelete}
        aria-label={`Delete ${u.name}`}
        title="Delete"
        className="absolute top-1.5 right-1.5 h-7 w-7 rounded-lg bg-surface/90 border border-line text-ink-2 hover:text-danger flex items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition"
      >
        <Icon name="trash" size={14} />
      </button>
    </div>
  )
}
