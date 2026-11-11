import { useEffect, useState } from 'react'
import { DEFAULT_PAGE_DURATION } from '@/doc/schema'
import { canEdit, useEditor } from '@/stores/editor'
import { useDoc, usePage } from '../hooks'

export default function NotesPane() {
  const page = usePage()
  const doc = useDoc()
  const editable = canEdit(useEditor((s) => s.role))
  const [notes, setNotes] = useState(page?.notes ?? '')
  useEffect(() => setNotes(page?.notes ?? ''), [page?.id, page?.notes])
  if (!page) return null
  const index = doc.pages.findIndex((p) => p.id === page.id)
  const set = (patch: Parameters<NonNullable<ReturnType<typeof useEditor.getState>['doc']>['updatePage']>[1]) =>
    useEditor.getState().doc?.updatePage(page.id, patch)
  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-[13px] font-medium">
        Notes for page {index + 1}
        <textarea
          value={notes}
          readOnly={!editable}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (page.notes ?? '') && set({ notes: notes || undefined })}
          placeholder="What you want to say on this page. Only you see these while presenting."
          rows={10}
          className="rounded-control border border-line-2 p-3 text-[13px] font-normal leading-relaxed bg-surface resize-y outline-none focus:border-accent-soft"
        />
      </label>
      <label className="flex items-center justify-between text-[13px]">
        <span>Page duration</span>
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            min={0.5}
            max={120}
            step={0.5}
            disabled={!editable}
            value={(page.duration ?? DEFAULT_PAGE_DURATION) / 1000}
            onChange={(e) => set({ duration: Math.round(Number(e.target.value) * 1000) })}
            className="w-16 h-8 rounded-lg border border-line-2 px-2 text-right bg-surface"
          />
          s
        </span>
      </label>
      <p className="text-[12px] text-muted">Duration sets how long the page shows when presenting on autoplay and in video exports.</p>
    </div>
  )
}
