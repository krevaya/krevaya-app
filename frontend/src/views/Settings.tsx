import { Icon } from '@/components/icons'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { api, type User } from '@/api/client'
import { AppRail } from '@/components/shell/AppRail'
import { Button, Card, Input, Spinner } from '@/components/ui/kit'
import { AppearanceControls } from '@/features/collab/Appearance'
import { ago } from '@/features/collab/comments'
import { useAuth } from '@/stores/auth'

type Token = { id: string; name: string; prefix: string; created_at: string; last_used_at: string | null }

export default function Settings() {
  const user = useAuth((s) => s.user)
  useEffect(() => {
    document.title = 'Settings · Krevaya'
  }, [])
  return (
    <div className="h-full flex bg-surface">
      <AppRail />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-[68px] shrink-0 border-b border-line flex items-center gap-3 px-6">
          <div className="flex-1" />
          {user && <span className="text-[13px] text-muted">{user.email}</span>}
        </header>
        <main className="flex-1 overflow-y-auto scroll-thin">
          <div className="max-w-[760px] mx-auto px-6 py-8 flex flex-col gap-5">
            <div className="mb-1">
              <h1 className="font-display text-[30px] font-semibold tracking-tight text-ink">Settings</h1>
              <p className="text-[15px] text-muted mt-1">{user ? 'Your profile, password, look and feel, and API access.' : 'Look and feel for this browser.'}</p>
            </div>
            {!user && <SignInPrompt />}
            {user && <Profile user={user} />}
            {user && <Password user={user} />}
            <Section title="Appearance" sub={user ? 'Saved to your account, so it follows you to other devices.' : 'Kept on this device until you sign in.'}>
              <AppearanceControls />
            </Section>
            {user && <Tokens />}
            <Section title="Licenses and credits" sub="The libraries, fonts, icons and model this app builds on.">
              <a href="/licenses/" target="_blank" rel="noreferrer" className="text-[13px] text-accent hover:underline">
                Read the licenses and credits
              </a>
            </Section>
            {user && <SignOut />}
          </div>
        </main>
      </div>
    </div>
  )
}

function Section({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-6">
      <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      {sub && <p className="text-[13px] text-muted mt-0.5">{sub}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  )
}

function Status({ ok, error }: { ok?: string; error?: string }) {
  if (error) return <p className="text-[13px] text-danger" role="alert">{error}</p>
  if (ok) return <p className="text-[13px] text-emerald-600 flex items-center gap-1" role="status"><Icon name="check" size={14} />{ok}</p>
  return null
}

function SignInPrompt() {
  return (
    <div className="rounded-card border border-accent-line bg-accent-wash px-5 py-4 flex items-center gap-4 flex-wrap">
      <p className="flex-1 min-w-[220px] text-[14px] text-ink">Sign in to set your name and password, keep brand kits, and make API tokens. Theme and contrast work without an account.</p>
      <Link href="/login?next=/settings"><Button variant="outline">Sign in</Button></Link>
      <Link href="/signup?next=/settings"><Button variant="primary">Create account</Button></Link>
    </div>
  )
}

function Profile({ user }: { user: User }) {
  const [name, setName] = useState(user.name)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState('')
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)
  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setOk('')
    setError('')
    try {
      const u = await api<User>('/api/auth/me', { method: 'PATCH', json: { name: name.trim() } })
      useAuth.getState().setUser(u)
      setOk('Saved')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title="Profile">
      <form onSubmit={save} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          Name
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Shown on comments and to people editing with you" />
        </label>
        <div className="flex flex-col gap-1 text-[13px]">
          <span className="font-medium text-ink-2">Email</span>
          <span className="text-ink">{user.email}</span>
          {!user.email_verified && (
            <span className="text-muted">
              Not confirmed yet.{' '}
              <button
                type="button"
                disabled={resent}
                className="text-accent hover:underline disabled:no-underline disabled:text-muted"
                onClick={() => api('/api/auth/verify/resend', { method: 'POST' }).then(() => setResent(true)).catch((e: Error) => setError(e.message))}
              >
                {resent ? 'Link sent, check your inbox' : 'Send a new link'}
              </button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy || name.trim() === user.name}>{busy ? 'Saving…' : 'Save'}</Button>
          <Status ok={ok} error={error} />
        </div>
      </form>
    </Section>
  )
}

function Password({ user }: { user: User }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState('')
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setOk('')
    setError('')
    if (next !== confirm) return setError("The new passwords don't match")
    setBusy(true)
    try {
      await api('/api/auth/password', { method: 'POST', json: { current, new: next } })
      useAuth.getState().setUser({ ...user, has_password: true })
      setCurrent('')
      setNext('')
      setConfirm('')
      setOk('Password changed')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Section title={user.has_password ? 'Change password' : 'Set a password'} sub={user.has_password ? undefined : 'Your account uses Google or single sign-on. Add a password if you also want to sign in with your email.'}>
      <form onSubmit={submit} className="flex flex-col gap-3 max-w-[380px]">
        {user.has_password && (
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
            Current password
            <Input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          New password
          <Input type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="At least 8 characters" />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
          Type it again
          <Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" variant="primary" disabled={busy || next.length < 8 || !confirm}>{busy ? 'Saving…' : 'Update password'}</Button>
          <Status ok={ok} error={error} />
        </div>
      </form>
    </Section>
  )
}

function Tokens() {
  const [tokens, setTokens] = useState<Token[] | null>(null)
  const [name, setName] = useState('')
  const [fresh, setFresh] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api<{ tokens: Token[] }>('/api/tokens')
      .then((r) => setTokens(r.tokens))
      .catch((e: Error) => {
        setTokens([])
        setError(e.message)
      })
  }, [])

  const create = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const t = await api<Token & { token: string }>('/api/tokens', { method: 'POST', json: { name: name.trim() || 'API token' } })
      const { token, ...row } = t
      setFresh(token)
      setCopied(false)
      setTokens((list) => [row, ...(list ?? [])])
      setName('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (t: Token) => {
    if (!confirm(`Delete "${t.name}"? Anything using it stops working straight away.`)) return
    try {
      await api(`/api/tokens/${t.id}`, { method: 'DELETE' })
      setTokens((list) => (list ?? []).filter((x) => x.id !== t.id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const copy = async () => {
    if (!fresh) return
    try {
      await navigator.clipboard.writeText(fresh)
      setCopied(true)
    } catch {
      window.prompt('Copy your token', fresh)
    }
  }

  return (
    <Section
      title="API tokens"
      sub={
        <>
          Let scripts and AI assistants work with your designs. Send a token as <code className="text-ink">Authorization: Bearer &lt;token&gt;</code> to
          the REST API under <code className="text-ink">/api</code>, or add <code className="text-ink">{location.origin}/mcp</code> as an MCP server
          in your assistant and give it the token. A token can do anything you can, so keep it secret.
        </>
      }
    >
      {fresh && (
        <div className="mb-4 rounded-control border border-accent-line bg-accent-wash p-3.5">
          <p className="text-[13px] font-medium text-ink mb-2">Copy your new token now. You won't see it again.</p>
          <div className="flex gap-2">
            <code className="flex-1 min-w-0 h-9 px-3 rounded-lg bg-surface border border-line text-[12px] flex items-center overflow-x-auto whitespace-nowrap scroll-thin">{fresh}</code>
            <Button size="sm" className="h-9" variant={copied ? 'soft' : 'primary'} onClick={() => void copy()}>
              {copied ? <><Icon name="check" size={14} /> Copied</> : <><Icon name="copy" size={14} /> Copy</>}
            </Button>
          </div>
          <button className="text-[12px] text-muted hover:text-ink mt-2" onClick={() => setFresh(null)}>I've saved it</button>
        </div>
      )}
      <form onSubmit={create} className="flex gap-2 mb-4">
        <Input className="flex-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Token name, e.g. Laptop assistant" maxLength={80} icon={<Icon name="key" size={15} />} aria-label="Token name" />
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Creating…' : 'Create token'}</Button>
      </form>
      {error && <p className="text-[13px] text-danger mb-3" role="alert">{error}</p>}
      {tokens === null ? (
        <div className="py-4 flex justify-center"><Spinner /></div>
      ) : tokens.length === 0 ? (
        <p className="text-[13px] text-muted">No tokens yet.</p>
      ) : (
        <ul className="divide-y divide-line border border-line rounded-control">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-ink truncate">{t.name}</p>
                <p className="text-[12px] text-muted">
                  <code>{t.prefix}…</code> · made {ago(t.created_at)} · {t.last_used_at ? `last used ${ago(t.last_used_at)}` : 'never used'}
                </p>
              </div>
              <button onClick={() => void remove(t)} className="h-8 w-8 rounded-lg text-muted hover:text-danger hover:bg-hover flex items-center justify-center" aria-label={`Delete ${t.name}`} title="Delete token">
                <Icon name="trash" size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function SignOut() {
  const [, go] = useLocation()
  return (
    <Section title="Sign out" sub="Your designs stay in your account. On this browser you'll be a guest again.">
      <Button
        variant="danger"
        onClick={async () => {
          await useAuth.getState().logout()
          go('/')
        }}
      >
        <Icon name="logout" size={15} /> Sign out
      </Button>
    </Section>
  )
}
