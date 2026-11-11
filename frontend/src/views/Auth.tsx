import { Icon } from '@/components/icons'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation } from 'wouter'
import { api, type User } from '@/api/client'
import { Logo } from '@/components/shell/Logo'
import { Button, Card, Input, Spinner } from '@/components/ui/kit'
import { useAuth } from '@/stores/auth'

type Mode = 'login' | 'signup' | 'forgot' | 'reset' | 'verify'

function query(name: string) {
  return new URLSearchParams(location.search).get(name) ?? ''
}

/** Only follow ?next= within this site. */
function nextPath() {
  const n = query('next')
  return n.startsWith('/') && !n.startsWith('//') && !n.startsWith('/\\') ? n : '/'
}

export default function Auth({ mode }: { mode: Mode }) {
  const user = useAuth((s) => s.user)
  const [, go] = useLocation()

  useEffect(() => {
    document.title = `${TITLES[mode]} · Krevaya`
  }, [mode])

  useEffect(() => {
    if (user && (mode === 'login' || mode === 'signup')) go(nextPath(), { replace: true })
  }, [user, mode, go])

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
        <Link href="/" className="mb-6 flex items-center gap-2.5" aria-label="Krevaya home">
          <Logo size={40} />
          <span className="font-display text-[20px] font-semibold text-ink">Krevaya</span>
        </Link>
        <Card className="w-full max-w-[400px] p-7">
          {mode === 'login' && <Login />}
          {mode === 'signup' && <Signup />}
          {mode === 'forgot' && <Forgot />}
          {mode === 'reset' && <Reset />}
          {mode === 'verify' && <Verify />}
        </Card>
        <OfflineNote />
        <Link href="/" className="mt-5 text-[13px] text-muted hover:text-ink">Keep designing without an account</Link>
      </div>
    </div>
  )
}

const TITLES: Record<Mode, string> = {
  login: 'Sign in',
  signup: 'Create your account',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
  verify: 'Confirm your email',
}

function Heading({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-[24px] font-semibold tracking-tight text-ink">{title}</h1>
      {sub && <p className="text-[14px] text-muted mt-1">{sub}</p>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-[13px] font-medium text-ink-2">
      {label}
      {children}
    </label>
  )
}

function ErrorText({ error }: { error: string }) {
  if (!error) return null
  return <p className="text-[13px] text-danger" role="alert">{error}</p>
}

function useSubmit(initialError = '') {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(initialError)
  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError('')
    try {
      await fn()
    } catch (e) {
      setError((e as Error).message || 'Something went wrong. Try again.')
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run, setError }
}

function SsoButtons() {
  const config = useAuth((s) => s.config)
  if (!config.google && !config.oidc) return null
  const next = encodeURIComponent(nextPath())
  return (
    <>
      <div className="flex flex-col gap-2">
        {config.google && (
          <a href={`/api/auth/google/start?next=${next}`} className="h-10 rounded-control border border-line-2 bg-surface hover:bg-hover text-[14px] font-medium text-ink flex items-center justify-center gap-2.5">
            <span className="h-5 w-5 rounded-full border border-line-2 text-[11px] font-bold flex items-center justify-center" aria-hidden>G</span> Continue with Google
          </a>
        )}
        {config.oidc && (
          <a href={`/api/auth/oidc/start?next=${next}`} className="h-10 rounded-control border border-line-2 bg-surface hover:bg-hover text-[14px] font-medium text-ink flex items-center justify-center gap-2.5">
            <Icon name="key" size={16} /> Continue with {config.oidc}
          </a>
        )}
      </div>
      <div className="flex items-center gap-3 my-5 text-[12px] text-faint">
        <span className="flex-1 h-px bg-line" />
        or with email
        <span className="flex-1 h-px bg-line" />
      </div>
    </>
  )
}

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // a failed Google or single sign-on attempt comes back here with ?error=
  const { busy, error, run } = useSubmit(query('error'))
  const signup = useAuth((s) => s.config.signup)
  const next = nextPath()
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const user = await api<User>('/api/auth/login', { method: 'POST', json: { email: email.trim(), password } })
      useAuth.getState().setUser(user)
    })
  }
  return (
    <>
      <Heading title="Sign in" sub="Pick up your designs, brand kits and links where you left them." />
      <SsoButtons />
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="Email">
          <Input type="email" autoFocus required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} icon={<Icon name="at" size={15} />} placeholder="you@example.com" />
        </Field>
        <Field label="Password">
          <Input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} icon={<Icon name="lock" size={15} />} />
        </Field>
        <div className="flex justify-end -mt-1.5">
          <Link href="/forgot" className="text-[13px] text-accent hover:underline">Forgot password?</Link>
        </div>
        <ErrorText error={error} />
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</Button>
      </form>
      {signup && (
        <p className="text-[13px] text-muted text-center mt-5">
          No account yet? <Link href={`/signup${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-accent font-medium hover:underline">Sign up</Link>
        </p>
      )}
    </>
  )
}

function Signup() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const { busy, error, run } = useSubmit()
  const allowed = useAuth((s) => s.config.signup)
  const next = nextPath()
  if (!allowed) {
    return (
      <>
        <Heading title="Sign-ups are closed" sub="This server isn't taking new accounts right now. Ask whoever runs it for an invite." />
        <Link href="/login"><Button variant="primary" className="w-full">Sign in instead</Button></Link>
      </>
    )
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      const user = await api<User>('/api/auth/signup', { method: 'POST', json: { name: name.trim(), email: email.trim(), password } })
      useAuth.getState().setUser(user)
    })
  }
  return (
    <>
      <Heading title="Create your account" sub="An account backs up your work and lets you share it, invite others and save brand kits." />
      <SsoButtons />
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="Name">
          <Input autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} icon={<Icon name="user" size={15} />} placeholder="What should we call you?" maxLength={120} />
        </Field>
        <Field label="Email">
          <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} icon={<Icon name="at" size={15} />} placeholder="you@example.com" />
        </Field>
        <Field label="Password">
          <Input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} icon={<Icon name="lock" size={15} />} placeholder="At least 8 characters" />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" variant="primary" disabled={busy || password.length < 8}>{busy ? 'Creating account…' : 'Create account'}</Button>
        <p className="text-[12px] text-muted text-center">Already made something as a guest? We'll offer to move it into your new account.</p>
      </form>
      <p className="text-[13px] text-muted text-center mt-5">
        Already have an account? <Link href={`/login${next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-accent font-medium hover:underline">Sign in</Link>
      </p>
    </>
  )
}

function Forgot() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const { busy, error, run } = useSubmit()
  if (sent) {
    return (
      <Done title="Check your inbox">
        If there's an account for <span className="text-ink font-medium">{email}</span>, we've sent a link to reset the password. It works for 2 hours.
      </Done>
    )
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    void run(async () => {
      await api('/api/auth/forgot', { method: 'POST', json: { email: email.trim() } })
      setSent(true)
    })
  }
  return (
    <>
      <Heading title="Forgot your password?" sub="Enter your email and we'll send you a link to choose a new one." />
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="Email">
          <Input type="email" autoFocus required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} icon={<Icon name="at" size={15} />} placeholder="you@example.com" />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" variant="primary" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</Button>
      </form>
      <p className="text-[13px] text-muted text-center mt-5">
        Remembered it? <Link href="/login" className="text-accent font-medium hover:underline">Sign in</Link>
      </p>
    </>
  )
}

function Reset() {
  const token = query('token')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const { busy, error, run, setError } = useSubmit()
  if (!token) {
    return (
      <Done title="This link is incomplete" bad>
        Open the reset link from your email again, or <Link href="/forgot" className="text-accent hover:underline">ask for a new one</Link>.
      </Done>
    )
  }
  if (done) {
    return (
      <Done title="Password changed" action={<Link href="/login"><Button variant="primary" className="w-full">Sign in</Button></Link>}>
        You're all set. For safety we signed you out everywhere, so sign in again with your new password.
      </Done>
    )
  }
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return setError("The passwords don't match")
    void run(async () => {
      await api('/api/auth/reset', { method: 'POST', json: { token, password } })
      useAuth.getState().setUser(null)
      setDone(true)
    })
  }
  return (
    <>
      <Heading title="Choose a new password" />
      <form onSubmit={submit} className="flex flex-col gap-3.5">
        <Field label="New password">
          <Input type="password" autoFocus required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} icon={<Icon name="lock" size={15} />} placeholder="At least 8 characters" />
        </Field>
        <Field label="Type it again">
          <Input type="password" required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} icon={<Icon name="lock" size={15} />} />
        </Field>
        <ErrorText error={error} />
        <Button type="submit" variant="primary" disabled={busy || password.length < 8 || !confirm}>{busy ? 'Saving…' : 'Save new password'}</Button>
      </form>
    </>
  )
}

function Verify() {
  const token = query('token')
  const user = useAuth((s) => s.user)
  const [state, setState] = useState<'working' | 'ok' | 'bad' | 'idle'>(token ? 'working' : 'idle')
  const [error, setError] = useState('')
  const [resent, setResent] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    api('/api/auth/verify', { method: 'POST', json: { token } })
      .then(() => {
        setState('ok')
        const u = useAuth.getState().user
        if (u) useAuth.getState().setUser({ ...u, email_verified: true })
      })
      .catch((e: Error) => {
        setError(e.message)
        setState('bad')
      })
  }, [token])

  const resend = async () => {
    try {
      await api('/api/auth/verify/resend', { method: 'POST' })
      setResent(true)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (state === 'working') {
    return (
      <div className="py-8 flex flex-col items-center gap-3 text-[14px] text-muted">
        <Spinner /> Confirming your email…
      </div>
    )
  }
  if (state === 'ok') {
    return (
      <Done title="Email confirmed" action={<Link href="/"><Button variant="primary" className="w-full">Go to your designs</Button></Link>}>
        All set, your address checks out.
      </Done>
    )
  }
  const canResend = user && !user.email_verified
  return (
    <Done
      title={state === 'bad' ? "We couldn't confirm your email" : 'Confirm your email'}
      bad={state === 'bad'}
      icon={state === 'idle' ? <Icon name="inbox" size={30} className="text-accent mb-3" /> : undefined}
      action={canResend ? <Button variant="primary" className="w-full" disabled={resent} onClick={() => void resend()}>{resent ? 'Sent, check your inbox' : 'Send a new link'}</Button> : undefined}
    >
      {state === 'bad' ? `${error}. ` : 'Open the link we emailed you to confirm your address. '}
      {!user && <><Link href="/login?next=/verify" className="text-accent hover:underline">Sign in</Link> to get a new link.</>}
      {user?.email_verified && 'Your email is already confirmed.'}
    </Done>
  )
}

function Done({ title, children, action, bad, icon }: { title: string; children: ReactNode; action?: ReactNode; bad?: boolean; icon?: ReactNode }) {
  return (
    <div className="flex flex-col">
      {icon ?? (!bad && <Icon name="check-circle" size={32} className="text-emerald-600 mb-3" />)}
      <h1 className="font-display text-[22px] font-semibold tracking-tight text-ink">{title}</h1>
      <p className="text-[14px] text-muted mt-2 leading-relaxed">{children}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  )
}

function OfflineNote() {
  const offline = useAuth((s) => s.offline)
  if (!offline) return null
  return (
    <p className="mt-4 max-w-[400px] text-center text-[13px] text-muted">
      We can't reach the server right now, so signing in won't work. Guest mode still works, and keeps your designs on this device for now.
    </p>
  )
}
