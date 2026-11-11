import { useEffect, useState } from 'react'
import { Link } from 'wouter'
import { AppRail } from '@/components/shell/AppRail'
import { Button, Spinner } from '@/components/ui/kit'
import { EditorFooter } from '@/editor/EditorFooter'
import { Canvas, getEngine } from '@/editor/Canvas'
import { SelectionBar } from '@/editor/SelectionBar'
import { Sidebar } from '@/editor/Sidebar'
import { PaneTabs } from '@/editor/PaneTabs'
import { EditorHeader } from '@/editor/EditorHeader'
import { useShortcuts } from '@/editor/useShortcuts'
import { openGuest, openRemote, type Session } from '@/persistence/session'
import { ensureFontCatalog, loadDesignFonts } from '@/editor/fonts'
import { useEditor } from '@/stores/editor'
import { PresentMode } from '@/motion/PresentMode'
import { ModalOutlet } from '@/editor/modals'

// Each feature folder can have a register.ts that adds dialogs, overlays and the
// like when the editor loads.
import.meta.glob('../features/*/register.{ts,tsx}', { eager: true })

// the browser tests read editor state and canvas positions through this (dev server only)
if (import.meta.env.DEV) Object.assign(window, { __ka: { editor: useEditor, engine: getEngine } })

let current: Session | null = null

/** The open editor session, for code that needs the websocket (cursors, comments). */
const SKIP = 'sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-control focus:bg-ink focus:text-surface focus:text-[13px]'

export function currentSession() {
  return current
}

export default function Editor({ id, guest, shareRole }: { id: string; guest: boolean; shareRole?: string }) {
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const presenting = useEditor((s) => s.presenting)
  useShortcuts()

  useEffect(() => {
    let disposed = false
    let session: Session | null = null
    let unwatch = () => {}
    setReady(false)
    // Text measured before its font is known wraps wrongly, so give the catalog
    // a moment to arrive before the first draw. Offline, carry on without it.
    const loadFonts = Promise.all([ensureFontCatalog(), guest ? null : loadDesignFonts(id)])
    const fonts = Promise.race([loadFonts, new Promise((r) => setTimeout(r, 4000))])
    Promise.all([guest ? openGuest(id) : openRemote(id), fonts])
      .then(([s]) => {
        if (disposed) return s.dispose()
        session = s
        current = s
        const first = s.doc.getSnapshot().pages[0]
        useEditor.setState({
          doc: s.doc, designId: id, guest: s.meta.guest, role: s.meta.role, title: s.meta.title,
          save: guest ? 'local' : 'saved', pageId: first?.id ?? null, selection: [], editingId: null,
          cropId: null, autoFit: true, peers: 0, presenting: false,
          panel: s.meta.role === 'owner' || s.meta.role === 'edit' ? 'templates' : s.meta.role === 'comment' ? 'comments' : null,
        })
        document.title = `${s.meta.title} · Krevaya`
        // undo, redo or a collaborator can remove the page you're on; move to its neighbor
        let lastIndex = 0
        unwatch = s.doc.subscribe(() => {
          const st = useEditor.getState()
          const pages = s.doc.getSnapshot().pages
          const i = pages.findIndex((p) => p.id === st.pageId)
          if (i >= 0) lastIndex = i
          else if (pages.length) st.setPage(pages[Math.min(lastIndex, pages.length - 1)].id)
        })
        setReady(true)
      })
      .catch((e: Error) => setError(e.message))
    return () => {
      disposed = true
      unwatch()
      session?.dispose()
      if (current === session) current = null
      useEditor.setState({ doc: null, designId: null, selection: [] })
    }
  }, [id, guest])

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center px-6">
        <p className="text-lg font-semibold">We couldn't open this design</p>
        <p className="text-muted max-w-sm">{error}</p>
        <Link href="/"><Button variant="primary">Back to your designs</Button></Link>
      </div>
    )
  }
  if (!ready) {
    return (
      <div className="h-full flex items-center justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="h-full flex bg-surface text-ink">
      <a href="#page-canvas" className={SKIP} onClick={(e) => { e.preventDefault(); document.getElementById('page-canvas')?.focus() }}>Skip to the page</a>
      {!shareRole && <AppRail editor />}
      <div className="flex-1 min-w-0 flex flex-col">
        <EditorHeader />
        <div className="flex-1 min-h-0 flex">
          <PaneTabs />
          <Sidebar />
          <main className="relative flex-1 min-w-0 bg-canvas" aria-label="Canvas">
            <Canvas />
            <SelectionBar />
          </main>
        </div>
        <EditorFooter />
      </div>
      {presenting && <PresentMode />}
      <ModalOutlet />
    </div>
  )
}
