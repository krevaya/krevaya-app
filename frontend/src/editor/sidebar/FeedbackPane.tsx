import { Icon } from '@/components/icons'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'wouter'
import { Button, cx, Empty, Spinner, Toggle } from '@/components/ui/kit'
import { MenuList, Flyout, type MenuItem } from '@/components/ui/Flyout'
import {
  addComment, ago, commentBlock, deleteComment, editComment, loadComments, setResolved, threads, useComments, type Comment,
} from '@/features/collab/comments'
import { useAuth } from '@/stores/auth'
import { useEditor } from '@/stores/editor'
import { useDoc } from '../hooks'

const POLL_MS = 15_000

export default function FeedbackPane() {
  const designId = useEditor((s) => s.designId)
  const role = useEditor((s) => s.role)
  const commentMode = useEditor((s) => s.commentMode)
  const doc = useDoc()
  const { comments, loaded, error, showResolved, activeId } = useComments()
  const block = commentBlock()

  useEffect(() => {
    if (!designId || block) return
    void loadComments(designId)
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void loadComments(designId)
    }, POLL_MS)
    return () => clearInterval(t)
  }, [designId, block])

  // scroll the picked thread into view when its pin is clicked
  useEffect(() => {
    if (activeId) document.getElementById(`thread-${activeId}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [activeId])

  if (block === 'signin') {
    return (
      <Empty title="Say who you are to comment">
        Every comment shows who wrote it, so replies have someone to go to.{' '}
        <Link href={`/login?next=${encodeURIComponent(location.pathname)}`} className="text-accent hover:underline">Sign in</Link> or{' '}
        <Link href="/signup" className="text-accent hover:underline">create a free account</Link>.
      </Empty>
    )
  }
  if (block === 'view' || role === 'view') {
    return <Empty title="View only">This link lets you look but not comment. Ask the owner for a comment link.</Empty>
  }

  const order = new Map(doc.pages.map((p, i) => [p.id, i]))
  const all = threads(comments)
  const resolvedCount = all.filter((t) => t.root.resolved).length
  const visible = all
    .filter((t) => showResolved || !t.root.resolved)
    .sort((a, b) => (order.get(a.root.page_id) ?? 999) - (order.get(b.root.page_id) ?? 999) || a.number - b.number)

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant={commentMode ? 'soft' : 'primary'}
        className="w-full rounded-full"
        onClick={() => {
          useEditor.setState({ commentMode: !commentMode })
          useComments.setState({ draft: null })
        }}
        aria-pressed={commentMode}
      >
        <Icon name="comment" size={16} /> {commentMode ? 'Click on the page…' : 'Add comment'}
      </Button>
      {commentMode && <p className="text-[12px] text-muted -mt-1">Click the spot you want to talk about. Press Esc to cancel.</p>}
      <div className="py-1">
        <Toggle label={`Show resolved${resolvedCount ? ` (${resolvedCount})` : ''}`} checked={showResolved} onChange={(v) => useComments.setState({ showResolved: v })} />
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
      {!loaded ? (
        <div className="py-10 flex justify-center"><Spinner /></div>
      ) : visible.length === 0 ? (
        <Empty title={all.length ? 'All caught up' : 'No comments yet'}>
          {all.length ? 'Every comment here is resolved.' : 'Add a comment to pin feedback to a spot on the page.'}
        </Empty>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((t) => (
            <Thread key={t.root.id} root={t.root} number={t.number} replies={t.replies} pageIndex={order.get(t.root.page_id)} active={t.root.id === activeId} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Thread({ root, number, replies, pageIndex, active }: { root: Comment; number: number; replies: Comment[]; pageIndex?: number; active: boolean }) {
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const open = () => {
    useComments.setState({ activeId: root.id })
    const s = useEditor.getState()
    if (root.page_id && s.doc?.page(root.page_id) && s.pageId !== root.page_id) s.setPage(root.page_id)
  }
  const send = async () => {
    if (!reply.trim()) return
    setBusy(true)
    try {
      await addComment({ body: reply.trim(), parent_id: root.id, page_id: root.page_id })
      setReply('')
    } catch (e) {
      alert((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <li
      id={`thread-${root.id}`}
      onClick={open}
      className={cx(
        'rounded-card border p-3 cursor-pointer transition',
        active ? 'border-accent-line bg-accent-wash/40 shadow-card' : 'border-line hover:border-line-2',
        root.resolved && !active && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-2 mb-1.5 text-[11px] text-muted">
        <span className={cx('h-5 min-w-5 px-1 rounded-full rounded-bl-none text-[11px] font-semibold flex items-center justify-center', root.resolved ? 'bg-surface-2 text-muted' : 'bg-ink text-surface')}>{number}</span>
        {pageIndex !== undefined && <span>Page {pageIndex + 1}</span>}
        {root.resolved && <span className="flex items-center gap-0.5 text-emerald-600"><Icon name="check" size={12} />Resolved</span>}
        <span className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation()
            void setResolved(root.id, !root.resolved).catch((err: Error) => alert(err.message))
          }}
          className="h-6 px-1.5 rounded-md hover:bg-hover text-ink-2 flex items-center gap-1"
          title={root.resolved ? 'Reopen' : 'Resolve'}
        >
          {root.resolved ? <><Icon name="rotate-ccw" size={12} />Reopen</> : <><Icon name="check" size={12} />Resolve</>}
        </button>
      </div>
      <Message c={root} />
      {replies.length > 0 && (
        <div className="mt-2 pl-3 border-l-2 border-line flex flex-col gap-2">
          {replies.map((r) => <Message key={r.id} c={r} />)}
        </div>
      )}
      {active && (
        <div className="mt-2.5 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send()
            }}
            placeholder="Reply"
            aria-label="Reply"
            rows={2}
            className="rounded-lg border border-line-2 bg-surface p-2 text-[13px] resize-none outline-none focus:border-accent-soft"
          />
          {reply.trim() && (
            <div className="flex justify-end">
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void send()}>{busy ? 'Sending…' : 'Reply'}</Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function Message({ c }: { c: Comment }) {
  const user = useAuth((s) => s.user)
  const role = useEditor((s) => s.role)
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(c.body)
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const mine = !!user && c.author_id === user.id
  const items: MenuItem[] = [
    ...(mine ? [{ label: 'Edit', onSelect: () => { setBody(c.body); setEditing(true) } }] : []),
    ...(mine || role === 'owner'
      ? [{ label: 'Delete', danger: true, onSelect: () => {
          if (confirm(c.parent_id ? 'Delete this reply?' : 'Delete this comment and its replies?')) void deleteComment(c.id).catch((e: Error) => alert(e.message))
        } }]
      : []),
  ]
  const save = async () => {
    if (!body.trim()) return
    try {
      await editComment(c.id, body.trim())
      setEditing(false)
    } catch (e) {
      alert((e as Error).message)
    }
  }
  return (
    <div>
      <div className="flex items-center gap-1.5">
        <span className="text-[13px] font-semibold text-ink truncate">{c.author}</span>
        <span className="text-[11px] text-faint whitespace-nowrap">{ago(c.created_at)}</span>
        <span className="flex-1" />
        {items.length > 0 && (
          <>
            <button ref={ref} onClick={(e) => { e.stopPropagation(); setMenu(!menu) }} className="h-6 w-6 rounded-md text-muted hover:bg-hover flex items-center justify-center" aria-label="Comment options">
              <Icon name="more" size={14} />
            </button>
            <Flyout anchor={ref.current} open={menu} onClose={() => setMenu(false)} place="bottom-end">
              <MenuList items={items} onClose={() => setMenu(false)} />
            </Flyout>
          </>
        )}
      </div>
      {editing ? (
        <div className="mt-1 flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
          <textarea
            autoFocus
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Escape') setEditing(false)
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void save()
            }}
            rows={3}
            aria-label="Edit comment"
            className="rounded-lg border border-line-2 bg-surface p-2 text-[13px] resize-none outline-none focus:border-accent-soft"
          />
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button size="sm" variant="primary" onClick={() => void save()}>Save</Button>
          </div>
        </div>
      ) : (
        <p className="text-[13px] text-ink-2 leading-relaxed whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
      )}
    </div>
  )
}
