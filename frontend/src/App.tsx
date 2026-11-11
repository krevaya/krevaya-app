import { lazy, Suspense, useEffect } from 'react'
import { Route, Switch } from 'wouter'
import { Spinner } from './components/ui/kit'
import { applyTheme } from './lib/theme'
import { useAuth } from './stores/auth'
import { useBrand } from './stores/brand'
import { Home } from './views/Home'

const Editor = lazy(() => import('./views/Editor'))
const AuthPage = lazy(() => import('./views/Auth'))
const Settings = lazy(() => import('./views/Settings'))
const BrandKitsView = lazy(() => import('./views/Brand'))
const SharePage = lazy(() => import('./views/Share'))
const PresentWindow = lazy(() => import('./views/SpeakerWindow'))
const SnapshotPage = lazy(() => import('./views/Snapshot'))

function Loading() {
  return (
    <div className="h-full flex items-center justify-center">
      <Spinner />
    </div>
  )
}

export function App() {
  const user = useAuth((s) => s.user)
  const ready = useAuth((s) => s.ready)

  useEffect(() => {
    void useAuth.getState().load()
  }, [])
  useEffect(() => {
    applyTheme()
    if (user) void useBrand.getState().load()
  }, [user])

  if (!ready) return <Loading />

  return (
    <Suspense fallback={<Loading />}>
      <Switch>
        <Route path="/design/:id">{(p) => <Editor key={p.id} id={p.id} guest={false} />}</Route>
        <Route path="/local/:id">{(p) => <Editor key={p.id} id={p.id} guest />}</Route>
        <Route path="/s/:token">{(p) => <SharePage token={p.token} />}</Route>
        <Route path="/snapshot/:id">{(p) => <SnapshotPage id={p.id} />}</Route>
        <Route path="/presenter/:id">{(p) => <PresentWindow id={p.id} />}</Route>
        <Route path="/login">{() => <AuthPage mode="login" />}</Route>
        <Route path="/signin">{() => <AuthPage mode="login" />}</Route>
        <Route path="/signup">{() => <AuthPage mode="signup" />}</Route>
        <Route path="/forgot">{() => <AuthPage mode="forgot" />}</Route>
        <Route path="/reset">{() => <AuthPage mode="reset" />}</Route>
        <Route path="/verify">{() => <AuthPage mode="verify" />}</Route>
        <Route path="/settings">{() => <Settings />}</Route>
        <Route path="/brand">{() => <BrandKitsView />}</Route>
        <Route path="/trash">{() => <Home tab="trash" />}</Route>
        <Route path="/designs">{() => <Home tab="designs" />}</Route>
        <Route path="/templates">{() => <Home tab="templates" />}</Route>
        <Route>{() => <Home tab="create" />}</Route>
      </Switch>
    </Suspense>
  )
}
