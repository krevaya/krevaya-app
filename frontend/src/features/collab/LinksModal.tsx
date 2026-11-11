import { Icon } from '@/components/icons'
import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Button, cx, Input, Spinner } from '@/components/ui/kit'
import { Modal } from '@/components/ui/Flyout'
import type { ModalProps } from '@/editor/modals'
import { useEditor } from '@/stores/editor'

type LinkRole = 'view' | 'comment' | 'edit'
type ShareLink = { id: string; token: string; role: LinkRole; has_password: boolean; url: string; created_at: string }

const ACCESS: Record<LinkRole, string> = { view: 'Can view', comment: 'Can comment', edit: 'Can edit' }
const ACCESS_NOTE: Record<LinkRole, string> = {
  view: 'Flip through, present and download',
  comment: 'Also leaves comments and replies',
  edit: 'Works on the design alongside you',
}

function AccessSelect({ value, onChange, label }: { value: LinkRole; onChange: (r: LinkRole) => void; label: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as LinkRole)}
      aria-label={label}
      className="h-8 rounded-lg border border-line-2 bg-surface px-2 text-[13px] text-ink-2 hover:bg-hover"
    >
      {(Object.keys(ACCESS) as LinkRole[]).map((r) => <option key={r} value={r}>{ACCESS[r]}</option>)}
    </select>
  )
}

function LinkRow({ link, fresh, onChange, onRemove }: {
  link: ShareLink
  fresh: boolean
  onChange: (patch: { role?: LinkRole; password?: string }) => Promise<void>
  onRemove: () => void
}) {
  const [copied, setCopied] = useState(false)
  const [locking, setLocking] = useState(false)
  const [password, setPassword] = useState('')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link.url)
    } catch {
      window.prompt('Copy this link', link.url)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const toggleLock = () => {
    if (link.has_password) void onChange({ password: '' })
    else setLocking((v) => !v)
  }

  return (
    <li className={cx('rounded-control border px-3 py-2.5 flex flex-col gap-2', fresh ? 'border-accent-line bg-accent-wash/40' : 'border-line')}>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate text-[12px] text-ink-2" title={link.url}>{link.url.replace(/^https?:\/\//, '')}</code>
        <Button size="sm" variant={copied ? 'soft' : fresh ? 'primary' : 'outline'} onClick={() => void copy()}>
          {copied ? <><Icon name="check" size={14} /> Copied</> : <><Icon name="copy" size={14} /> Copy</>}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <AccessSelect value={link.role} onChange={(role) => void onChange({ role })} label="Link access" />
        <span className="text-[12px] text-muted flex-1 min-w-0 truncate">{ACCESS_NOTE[link.role]}</span>
        <button
          onClick={toggleLock}
          aria-pressed={link.has_password}
          aria-label={link.has_password ? 'Unlock this link' : 'Lock this link'}
          title={link.has_password ? 'Password on. Click to take it off.' : 'Ask for a password'}
          className={cx('h-8 w-8 rounded-lg flex items-center justify-center hover:bg-hover', link.has_password ? 'text-accent' : 'text-muted')}
        >
          <Icon name="lock" size={15} />
        </button>
        <button onClick={onRemove} title="Remove link" aria-label="Remove link" className="h-8 w-8 rounded-lg text-muted hover:text-danger hover:bg-hover flex items-center justify-center">
          <Icon name="trash" size={15} />
        </button>
      </div>
      {locking && !link.has_password && (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!password) return
            void onChange({ password }).then(() => {
              setLocking(false)
              setPassword('')
            })
          }}
        >
          <Input
            className="flex-1"
            type="text"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password for this link"
            aria-label="Password for this link"
            maxLength={200}
            autoComplete="off"
          />
          <Button size="sm" variant="primary" type="submit" disabled={!password}>Lock</Button>
        </form>
      )}
    </li>
  )
}

export function LinksModal({ onClose }: ModalProps) {
  const designId = useEditor((s) => s.designId)
  const [links, setLinks] = useState<ShareLink[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [role, setRole] = useState<LinkRole>('view')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [freshId, setFreshId] = useState<string | null>(null)

  useEffect(() => {
    if (!designId) return
    api<{ links: ShareLink[] }>(`/api/designs/${designId}/links`)
      .then((r) => setLinks(r.links))
      .catch((e: Error) => {
        setLinks([])
        setError(e.message)
      })
  }, [designId])

  const make = async () => {
    setBusy(true)
    setError('')
    try {
      const link = await api<ShareLink>(`/api/designs/${designId}/links`, { method: 'POST', json: { role } })
      setLinks((l) => [link, ...(l ?? [])])
      setFreshId(link.id)
      setAdding(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const change = async (link: ShareLink, patch: { role?: LinkRole; password?: string }) => {
    setError('')
    try {
      const next = await api<ShareLink>(`/api/links/${link.id}`, { method: 'PATCH', json: patch })
      setLinks((l) => (l ?? []).map((x) => (x.id === link.id ? next : x)))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async (link: ShareLink) => {
    if (!confirm('Remove this link? People who use it will be shut out right away.')) return
    try {
      await api(`/api/links/${link.id}`, { method: 'DELETE' })
      setLinks((l) => (l ?? []).filter((x) => x.id !== link.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Modal open onClose={onClose} title="Links to this design" width={540}>
      <p className="text-[13px] text-muted -mt-1 mb-4">
        A link opens this design for people without an account here. Each link keeps its own access level, can be locked with a password, and stops working the moment you remove it.
      </p>

      {links === null ? (
        <div className="py-6 flex justify-center"><Spinner /></div>
      ) : (
        <ul className="flex flex-col gap-2">
          {links.length === 0 && !adding && (
            <li className="text-[13px] text-muted py-3 px-3 rounded-control bg-surface-2">This design is private for now. Add a link when you're ready to bring people in.</li>
          )}
          {links.map((l) => (
            <LinkRow key={l.id} link={l} fresh={l.id === freshId} onChange={(p) => change(l, p)} onRemove={() => void remove(l)} />
          ))}
        </ul>
      )}

      {adding ? (
        <div className="mt-2 rounded-control border border-dashed border-line-2 px-3 py-2.5 flex items-center gap-2">
          <AccessSelect value={role} onChange={setRole} label="Access for the new link" />
          <span className="text-[12px] text-muted flex-1 min-w-0 truncate">{ACCESS_NOTE[role]}</span>
          <Button size="sm" onClick={() => setAdding(false)}>Cancel</Button>
          <Button size="sm" variant="primary" disabled={busy || !designId} onClick={() => void make()}>
            {busy ? 'Making…' : 'Make link'}
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          disabled={!designId}
          className="mt-2 w-full h-10 rounded-control border border-dashed border-line-2 text-[13px] text-ink-2 hover:bg-hover flex items-center justify-center gap-1.5"
        >
          <Icon name="plus" size={15} /> Add link
        </button>
      )}

      {error && <p className="text-[13px] text-danger mt-3" role="alert">{error}</p>}
    </Modal>
  )
}
