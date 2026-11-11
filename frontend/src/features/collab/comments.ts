import { create } from 'zustand'
import { api, shareParams } from '@/api/client'
import { useAuth } from '@/stores/auth'
import { useEditor } from '@/stores/editor'

export type Comment = {
  id: string
  parent_id: string | null
  page_id: string
  x: number | null
  y: number | null
  body: string
  resolved: boolean
  author: string
  author_id: string | null
  created_at: string
  updated_at: string
}

export type Draft = { pageId: string; x: number; y: number }

type State = {
  designId: string | null
  comments: Comment[]
  loaded: boolean
  error: string | null
  showResolved: boolean
  activeId: string | null
  draft: Draft | null
}

export const useComments = create<State>(() => ({
  designId: null,
  comments: [],
  loaded: false,
  error: null,
  showResolved: false,
  activeId: null,
  draft: null,
}))

/** Why someone can't comment, or null when they can. */
export function commentBlock(): 'signin' | 'view' | null {
  const s = useEditor.getState()
  if (s.guest) return 'signin'
  if (s.role === 'view') return 'view'
  if (!useAuth.getState().user && !shareParams()) return 'signin'
  return null
}

export async function loadComments(designId: string) {
  const st = useComments.getState()
  if (st.designId !== designId) useComments.setState({ designId, comments: [], loaded: false, activeId: null, draft: null })
  try {
    const { comments } = await api<{ comments: Comment[] }>(`/api/designs/${designId}/comments`)
    if (useComments.getState().designId === designId) useComments.setState({ comments, loaded: true, error: null })
  } catch (e) {
    useComments.setState({ loaded: true, error: (e as Error).message })
  }
}

export function guestName(): string {
  try {
    return localStorage.getItem('ka:guest-name') ?? ''
  } catch {
    return ''
  }
}

export function setGuestName(name: string) {
  try {
    localStorage.setItem('ka:guest-name', name.trim())
  } catch {
    // private mode
  }
  // live cursors show this name too
  window.dispatchEvent(new Event('ka:guest-name'))
}

export async function addComment(c: { body: string; page_id?: string; x?: number; y?: number; parent_id?: string }) {
  const designId = useEditor.getState().designId
  if (!designId) return null
  const json = { ...c, guest_name: useAuth.getState().user ? '' : guestName() }
  const saved = await api<Comment>(`/api/designs/${designId}/comments`, { method: 'POST', json })
  useComments.setState((s) => ({ comments: [...s.comments, saved] }))
  return saved
}

async function patch(id: string, json: { body?: string; resolved?: boolean }) {
  const saved = await api<Comment>(`/api/comments/${id}`, { method: 'PATCH', json })
  useComments.setState((s) => ({ comments: s.comments.map((c) => (c.id === id ? saved : c)) }))
}

export const editComment = (id: string, body: string) => patch(id, { body })
export const setResolved = (id: string, resolved: boolean) => patch(id, { resolved })

export async function deleteComment(id: string) {
  await api(`/api/comments/${id}`, { method: 'DELETE' })
  // replies go with the thread
  useComments.setState((s) => ({
    comments: s.comments.filter((c) => c.id !== id && c.parent_id !== id),
    activeId: s.activeId === id ? null : s.activeId,
  }))
}

export function threads(comments: Comment[]) {
  const roots = comments.filter((c) => !c.parent_id)
  const replies = new Map<string, Comment[]>()
  for (const c of comments) if (c.parent_id) replies.set(c.parent_id, [...(replies.get(c.parent_id) ?? []), c])
  return roots.map((root, i) => ({ root, number: i + 1, replies: replies.get(root.id) ?? [] }))
}

export function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
