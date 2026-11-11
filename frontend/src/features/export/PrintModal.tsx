import { Icon } from '@/components/icons'
import { useEffect, useRef, useState } from 'react'
import { Modal } from '@/components/ui/Flyout'
import { Button, SectionLabel } from '@/components/ui/kit'
import type { ModalProps } from '@/editor/modals'
import { pageInches } from '@/export/paper'
import { useEditor } from '@/stores/editor'
import { isAbort, loadPrefs, PagePicker, choosePages, Progress, savePrefs, type PageMode } from './common'
import { printPages } from './print'

const SETTINGS_STORE_KEY = 'krevaya-app.print'

export default function PrintModal({ onClose }: ModalProps) {
  const doc = useEditor((s) => s.doc)
  const title = useEditor((s) => s.title)
  const [p, setP] = useState(() => loadPrefs<{ pages: PageMode; custom: string }>(SETTINGS_STORE_KEY, { pages: 'all', custom: '' }))
  const [busy, setBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ac = useRef<AbortController | null>(null)
  useEffect(() => () => ac.current?.abort(), [])

  const all = doc?.getSnapshot().pages ?? []
  const chosen = choosePages(all, p.pages, p.custom)
  const sizes = [...new Set(chosen.map((pg) => {
    const s = pageInches(pg)
    const r = (v: number) => Math.round(v * 100) / 100
    return `${r(s.width)} × ${r(s.height)} in`
  }))]

  async function run() {
    if (!chosen.length || busy !== null) return
    savePrefs(SETTINGS_STORE_KEY, p)
    const ctl = new AbortController()
    ac.current = ctl
    setError(null)
    setBusy(0)
    try {
      await printPages(chosen, title || 'Design', { signal: ctl.signal, onProgress: setBusy })
      setBusy(null)
      onClose()
    } catch (e) {
      setBusy(null)
      if (!isAbort(e)) setError(e instanceof Error ? e.message : 'Could not prepare the pages for printing.')
    }
  }

  const footer = busy !== null ? (
    <Progress fraction={busy} label={busy >= 1 ? 'Opening print dialog' : 'Drawing pages for print'} onCancel={() => ac.current?.abort()} />
  ) : (
    <Button variant="primary" className="w-full" onClick={run} disabled={!chosen.length}>
      <Icon name="printer" size={16} /> Print
    </Button>
  )

  return (
    <Modal open onClose={() => { ac.current?.abort(); onClose() }} title="Print" width={440} footer={footer}>
      <SectionLabel>Pages</SectionLabel>
      <PagePicker mode={p.pages} custom={p.custom} count={all.length} onMode={(m) => setP({ ...p, pages: m })} onCustom={(s) => setP({ ...p, custom: s })} />
      {sizes.length > 0 && (
        <p className="mt-4 text-[12px] text-muted leading-relaxed">
          Each page prints on its own sheet at {sizes.length === 1 ? sizes[0] : 'its own size'}. For best results set margins to none and turn on background graphics in the print settings.
        </p>
      )}
      {error && <p className="mt-4 text-[13px] text-danger" role="alert">{error}</p>}
    </Modal>
  )
}
