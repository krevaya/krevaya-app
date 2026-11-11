import { useEffect, useRef, useState } from 'react'
import { Button, cx } from '@/components/ui/kit'
import type { OverlayProps } from '@/editor/canvas/hooks'
import { usePage } from '@/editor/hooks'
import { useAuth } from '@/stores/auth'
import { useEditor } from '@/stores/editor'
import { addComment, commentBlock, guestName, loadComments, setGuestName, threads, useComments, type Draft } from './comments'

/** Where the overlay's (0, 0) sits: the stage moves over when rulers are on. */
export function stageOffset(engine: OverlayProps['engine']) {
  const c = engine.stage.container()
  return { left: c.offsetLeft, top: c.offsetTop }
}

export function CommentMarkers({ engine }: OverlayProps) {
  const page = usePage()
  const designId = useEditor((s) => s.designId)
  const role = useEditor((s) => s.role)
  const guest = useEditor((s) => s.guest)
  const commentMode = useEditor((s) => s.commentMode)
  const comments = useComments((s) => s.comments)
  const showResolved = useComments((s) => s.showResolved)
  const activeId = useComments((s) => s.activeId)
  const draft = useComments((s) => s.draft)

  // Pins show even with the panel closed, so fetch once when the design opens.
  useEffect(() => {
    if (!designId || guest || role === 'view' || commentBlock()) return
    if (useComments.getState().designId !== designId) void loadComments(designId)
  }, [designId, guest, role])

  useEffect(() => {
    const c = engine.stage.container()
    c.style.cursor = commentMode ? 'crosshair' : ''
    if (!commentMode) return
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useEditor.setState({ commentMode: false })
    }
    window.addEventListener('keydown', key)
    return () => {
      c.style.cursor = ''
      window.removeEventListener('keydown', key)
    }
  }, [engine, commentMode])

  useEffect(() => () => {
    useEditor.setState({ commentMode: false })
    useComments.setState({ draft: null })
  }, [])

  if (!page || guest || role === 'view') return null
  const off = stageOffset(engine)
  const pins = threads(comments).filter(({ root }) => root.page_id === page.id && root.x != null && root.y != null && (showResolved || !root.resolved || root.id === activeId))

  return (
    <div className="absolute right-0 bottom-0 pointer-events-none z-[6]" style={off}>
      {pins.map(({ root, number, replies }) => {
        const p = engine.screenBox({ x: root.x!, y: root.y!, width: 0, height: 0 })
        const active = root.id === activeId
        return (
          <button
            key={root.id}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              useComments.setState({ activeId: active ? null : root.id })
              useEditor.setState({ panel: 'comments' })
            }}
            title={`${root.author}: ${root.body}`}
            aria-label={`Comment ${number} by ${root.author}${replies.length ? `, ${replies.length} replies` : ''}`}
            className={cx(
              'pointer-events-auto absolute h-7 min-w-7 px-1.5 -translate-y-full rounded-full rounded-bl-none text-[12px] font-semibold flex items-center justify-center border-2 border-white shadow-pop transition',
              active ? 'bg-accent text-white ring-4 ring-accent/25 scale-110' : root.resolved ? 'bg-surface-2 text-muted' : 'bg-ink text-surface hover:scale-110',
            )}
            style={{ left: p.x, top: p.y, transformOrigin: 'bottom left' }}
          >
            {number}
          </button>
        )
      })}
      {draft && draft.pageId === page.id && <Composer draft={draft} at={engine.screenBox({ x: draft.x, y: draft.y, width: 0, height: 0 })} />}
    </div>
  )
}

function Composer({ draft, at }: { draft: Draft; at: { x: number; y: number } }) {
  const user = useAuth((s) => s.user)
  const [body, setBody] = useState('')
  const [name, setName] = useState(guestName())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  // the pin is dropped on pointerdown, and the mousedown that follows takes focus back,
  // so autoFocus alone loses it
  useEffect(() => {
    const id = setTimeout(() => box.current?.focus(), 0)
    return () => clearTimeout(id)
  }, [draft.x, draft.y])
  const cancel = () => useComments.setState({ draft: null })
  const post = async () => {
    if (!body.trim()) return
    setBusy(true)
    setError('')
    try {
      if (!user) setGuestName(name)
      const c = await addComment({ body: body.trim(), page_id: draft.pageId, x: draft.x, y: draft.y })
      useComments.setState({ draft: null, activeId: c?.id ?? null })
      useEditor.setState({ panel: 'comments' })
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }
  return (
    <>
      <span className="absolute h-7 w-7 -translate-y-full rounded-full rounded-bl-none bg-accent border-2 border-white shadow-pop" style={{ left: at.x, top: at.y }} />
      <div
        className="pointer-events-auto absolute w-[280px] p-3 rounded-card border border-line bg-surface shadow-pop flex flex-col gap-2"
        style={{ left: at.x + 36, top: at.y - 32 }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {!user && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            aria-label="Your name"
            maxLength={80}
            className="h-8 rounded-lg border border-line-2 bg-surface px-2.5 text-[13px] outline-none focus:border-accent-soft"
          />
        )}
        <textarea
          ref={box}
          autoFocus
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') cancel()
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void post()
          }}
          placeholder="Add a comment"
          aria-label="Comment"
          rows={3}
          className="rounded-lg border border-line-2 bg-surface p-2.5 text-[13px] leading-relaxed resize-none outline-none focus:border-accent-soft"
        />
        {error && <p className="text-[12px] text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={busy || !body.trim()} onClick={() => void post()}>{busy ? 'Posting…' : 'Comment'}</Button>
        </div>
      </div>
    </>
  )
}
