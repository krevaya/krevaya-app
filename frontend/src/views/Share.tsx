import { Icon } from '@/components/icons'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'wouter'
import { api, ApiError, useShareToken } from '@/api/client'
import { Logo } from '@/components/shell/Logo'
import { Button, Card, Input, Spinner } from '@/components/ui/kit'
import { useEditor } from '@/stores/editor'
import Editor from './Editor'

type Info = { design_id: string; role: 'view' | 'comment' | 'edit'; locked: boolean; title: string | null }

const unlockKey = (token: string) => `ka:unlock:${token}`

function storedUnlock(token: string) {
  try {
    return sessionStorage.getItem(unlockKey(token)) ?? ''
  } catch {
    return ''
  }
}

export default function Share({ token }: { token: string }) {
  const [info, setInfo] = useState<Info | null>(null)
  const [error, setError] = useState('')
  const [unlock, setUnlock] = useState(() => storedUnlock(token))
  const [ready, setReady] = useState(false)

  useEffect(() => {
    document.title = `${info?.title || 'Shared design'} · Krevaya`
  }, [info?.title])

  useEffect(() => {
    let live = true
    setReady(false)
    // the unlock header lets a password link open even where the cookie didn't stick
    useShareToken(token, storedUnlock(token))
    api<Info>(`/api/share/${token}`)
      .then((i) => live && setInfo(i))
      .catch((e: Error) => live && setError(e instanceof ApiError && e.status === 404 ? "This link doesn't work any more. Ask the person who shared it for a new one." : e.message))
    return () => {
      live = false
      useShareToken('')
    }
  }, [token])

  useEffect(() => {
    if (!info || info.locked) return
    useShareToken(token, unlock)
    // view and comment links open on the page itself, not the design tools
    useEditor.setState({ panel: info.role === 'comment' ? 'comments' : info.role === 'edit' ? 'templates' : null })
    setReady(true)
  }, [info, token, unlock])

  if (error) {
    return (
      <Shell>
        <h1 className="font-display text-[22px] font-semibold text-ink">Link not available</h1>
        <p className="text-[14px] text-muted mt-2">{error}</p>
        <Link href="/"><Button variant="primary" className="mt-6 w-full">Go to Krevaya</Button></Link>
      </Shell>
    )
  }
  if (!info) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    )
  }
  if (info.locked) {
    return (
      <PasswordForm
        token={token}
        onUnlocked={(value) => {
          try {
            sessionStorage.setItem(unlockKey(token), value)
          } catch {
            // the cookie still works
          }
          setUnlock(value)
          setInfo({ ...info, locked: false })
        }}
      />
    )
  }
  if (!ready) return null
  return <Editor key={info.design_id} id={info.design_id} guest={false} shareRole={info.role} />
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-canvas flex flex-col items-center justify-center px-4 py-10">
      <Link href="/" className="mb-6" aria-label="Krevaya home"><Logo size={44} /></Link>
      <Card className="w-full max-w-[400px] p-7">{children}</Card>
    </div>
  )
}

function PasswordForm({ token, onUnlocked }: { token: string; onUnlocked: (unlock: string) => void }) {
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api<{ unlock: string }>(`/api/share/${token}/unlock`, { method: 'POST', json: { password } })
      onUnlocked(r.unlock)
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }
  return (
    <Shell>
      <div className="h-11 w-11 rounded-full bg-accent-wash text-accent flex items-center justify-center mb-4"><Icon name="lock" size={20} /></div>
      <h1 className="font-display text-[22px] font-semibold text-ink">This design needs a password</h1>
      <p className="text-[14px] text-muted mt-1.5">The person who shared it can tell you what it is.</p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <Input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" autoComplete="off" aria-invalid={!!error} />
        {error && <p className="text-[13px] text-danger" role="alert">{error}</p>}
        <Button variant="primary" type="submit" disabled={busy || !password}>{busy ? 'Checking…' : 'Open design'}</Button>
      </form>
    </Shell>
  )
}
