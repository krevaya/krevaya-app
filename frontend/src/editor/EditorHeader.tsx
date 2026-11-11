import { Icon } from '@/components/icons'
import { useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'wouter'
import { api } from '@/api/client'
import { Button, cx, Input } from '@/components/ui/kit'
import { MenuList, Modal, Flyout, type MenuItem } from '@/components/ui/Flyout'
import { FORMATS, formatLabel } from '@/doc/formats'
import { deleteGuestDesign, duplicateGuestDesign, updateGuestMeta } from '@/persistence/local'
import { useAuth } from '@/stores/auth'
import { useBrand } from '@/stores/brand'
import { canEdit, useEditor } from '@/stores/editor'
import { redo, undo } from './actions'
import { usePage } from './hooks'
import { resizePages, type ReshapeMode } from './resize'
import { editorModals } from './modals'
import { PresenceAvatars } from '@/features/collab/presence'
import { busyToast, toast } from '@/features/photos/toast'
import { blobFromCanvas, download, renderPageCanvas, safeName } from '@/export/raster'
import { BACKUP_EXT, makeBackup } from '@/lib/backup'
import { currentPage } from './actions'

async function copyPageImage() {
  const page = currentPage()
  if (!page) return
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    toast("This browser can't copy images. Use Download instead.")
    return
  }
  try {
    // hand the clipboard a promise so the copy still counts as part of the click
    const blob = renderPageCanvas(page, Math.min(2, 4000 / Math.max(page.width, page.height))).then((c) => blobFromCanvas(c, 'image/png'))
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    toast('Copied. Paste it into a chat, email or document.')
  } catch {
    toast("Couldn't copy the page. Use Download instead.")
  }
}

async function saveBackup() {
  const s = useEditor.getState()
  if (!s.doc) return
  const t = busyToast('Packing the design and its photos…')
  try {
    const blob = await makeBackup(s.title, s.doc.getSnapshot())
    download(blob, `${safeName(s.title)}${BACKUP_EXT}`)
    t.done('Backup saved. Open it from the Designs page any time.')
  } catch (e) {
    t.done((e as Error).message)
  }
}

export function EditorHeader() {
  const title = useEditor((s) => s.title)
  const role = useEditor((s) => s.role)
  const page = usePage()
  const user = useAuth((s) => s.user)
  const guest = useEditor((s) => s.guest)
  const [editing, setEditing] = useState(false)
  const editable = canEdit(role)

  return (
    <header className="h-[68px] shrink-0 flex items-center gap-2 px-5 border-b border-line bg-surface relative">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-accent via-accent-mid to-accent-soft" aria-hidden />
      {editable && (guest || user) && <BrandChip />}
      <PresenceAvatars />
      <PresenceLabel />
      <FileMenu />
      {editable && <ResizeMenu />}
      <span className="w-px h-6 bg-line mx-1" />
      <UndoRedo />
      <SyncBadge />
      {role === 'owner' && !guest && (
        <Button variant="outline" className="ml-2 rounded-full" onClick={() => editorModals.show('links')}>
          <Icon name="send" size={16} />
          Share
        </Button>
      )}
      <div className="flex-1" />
      <div className="text-right min-w-0">
        {editing && editable ? (
          <TitleInput title={title} onDone={() => setEditing(false)} />
        ) : (
          <button
            className="block max-w-[340px] truncate text-[15px] font-semibold text-ink hover:text-accent ml-auto"
            onClick={() => editable && setEditing(true)}
            title={editable ? 'Rename' : title}
          >
            {title}
          </button>
        )}
        {page && (
          <p className="text-[12px] text-muted">
            {formatLabel(page.width, page.height)} · {page.width} × {page.height} px
          </p>
        )}
      </div>
      <span className="w-px h-8 bg-line mx-2" />
      <div className="h-10 w-10 rounded-full bg-ink text-surface flex items-center justify-center font-semibold" title={user?.email ?? 'Guest'}>
        {(user?.name || user?.email || 'G').slice(0, 1).toUpperCase()}
      </div>
    </header>
  )
}

export async function renameDesign(title: string) {
  const { designId, guest } = useEditor.getState()
  const t = title.trim() || 'Untitled design'
  useEditor.setState({ title: t })
  document.title = `${t} · Krevaya`
  if (!designId) return
  if (guest) await updateGuestMeta(designId, { title: t })
  else await api(`/api/designs/${designId}`, { method: 'PATCH', json: { title: t } })
}

function TitleInput({ title, onDone }: { title: string; onDone: () => void }) {
  const [v, setV] = useState(title)
  const done = () => {
    void renameDesign(v)
    onDone()
  }
  return (
    <input
      autoFocus
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={done}
      onKeyDown={(e) => {
        if (e.key === 'Enter') done()
        if (e.key === 'Escape') onDone()
      }}
      className="h-8 w-[300px] text-right text-[15px] font-semibold rounded-lg border border-accent-soft px-2 outline-none bg-surface"
      aria-label="Design title"
    />
  )
}

function BrandChip() {
  const kits = useBrand((s) => s.kits)
  const active = useBrand((s) => s.active)
  const guest = useEditor((s) => s.guest)
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [, go] = useLocation()
  const name = guest ? 'Guest' : active?.name ?? 'No brand kit'
  const color = active?.colors[0] ?? '#b79aef'
  return (
    <>
      <button ref={ref} onClick={() => setOpen(!open)} className="h-10 pl-1.5 pr-3 flex items-center gap-2 rounded-full border border-line-2 hover:bg-hover">
        <span className="h-7 w-7 rounded-full flex items-center justify-center text-[12px] font-bold text-ink" style={{ background: color }}>
          {name.slice(0, 1).toUpperCase()}
        </span>
        <span className="text-[14px] font-medium max-w-[140px] truncate">{name}</span>
        <Icon name="chevron-down" size={14} className="text-muted" />
      </button>
      <Flyout anchor={ref.current} open={open} onClose={() => setOpen(false)}>
        <MenuList
          onClose={() => setOpen(false)}
          items={
            guest
              ? [
                  { type: 'label', label: 'Brand kits' },
                  { label: 'Keep brand kits with a free account', onSelect: () => go('/login') },
                ]
              : [
                  { type: 'label', label: 'Brand kit' },
                  ...kits.map((k) => ({ label: k.name, checked: k.id === active?.id, onSelect: () => useBrand.getState().setActive(k.id) })),
                  { type: 'sep' as const },
                  { label: 'Manage brand kits', onSelect: () => go('/brand') },
                ]
          }
        />
      </Flyout>
    </>
  )
}

function PresenceLabel() {
  const guest = useEditor((s) => s.guest)
  const peers = useEditor((s) => s.peers)
  const save = useEditor((s) => s.save)
  let text = 'Only you here'
  if (guest) return null
  if (save === 'offline') text = 'Offline'
  else if (peers > 0) text = `${peers} other${peers > 1 ? 's' : ''} here`
  return (
    <span className="text-[12px] text-muted hidden xl:flex items-center gap-1.5 mx-1">
      {peers > 0 && <Icon name="user" size={13} />}
      {text}
    </span>
  )
}

function UndoRedo() {
  const role = useEditor((s) => s.role)
  const doc = useEditor((s) => s.doc)
  if (!canEdit(role) || !doc) return null
  return (
    <>
      <button onClick={undo} title="Undo (⌘Z)" aria-label="Undo" className="h-8 w-8 rounded-lg text-muted hover:bg-hover hover:text-ink flex items-center justify-center"><Icon name="undo" size={16} /></button>
      <button onClick={redo} title="Redo (⇧⌘Z)" aria-label="Redo" className="h-8 w-8 rounded-lg text-muted hover:bg-hover hover:text-ink flex items-center justify-center"><Icon name="redo" size={16} /></button>
    </>
  )
}

function SyncBadge() {
  const save = useEditor((s) => s.save)
  const map: Record<string, ReactNode> = {
    saved: <><Icon name="check" size={14} className="text-emerald-600" /> All changes saved</>,
    local: <span className="flex items-center gap-1.5" title="Guest designs live in this browser until you sign up"><Icon name="alert" size={14} /> Guest draft, not backed up</span>,
    saving: <>Saving…</>,
    offline: <><Icon name="alert" size={14} /> No connection, we'll save when you're back</>,
    error: <span className="text-danger">Couldn't save, retrying</span>,
    refused: <span className="text-danger">You can't edit this design any more</span>,
  }
  return <span className="text-[12px] text-muted flex items-center gap-1.5 ml-1 whitespace-nowrap" aria-live="polite">{map[save]}</span>
}

function MenuTrigger({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen(!open)}
        className={cx('h-9 px-3.5 rounded-control text-[14px]', open ? 'bg-accent-wash text-accent' : 'text-ink-2 hover:bg-hover')}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
      </button>
      <Flyout anchor={ref.current} open={open} onClose={() => setOpen(false)}>
        {children(() => setOpen(false))}
      </Flyout>
    </>
  )
}

function FileMenu() {
  const [, go] = useLocation()
  const s = useEditor()
  const user = useAuth((x) => x.user)
  const editable = canEdit(s.role)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState('')

  const copy = async () => {
    if (s.guest) {
      const id = await duplicateGuestDesign(s.designId!)
      if (id) go(`/local/${id}`)
    } else {
      const d = await api<{ id: string }>(`/api/designs/${s.designId}/duplicate`, { method: 'POST' })
      go(`/design/${d.id}`)
    }
  }
  const trash = async () => {
    if (!confirm('Move this design to the trash? You can restore it from Trash.')) return
    if (s.guest) await deleteGuestDesign(s.designId!)
    else await api(`/api/designs/${s.designId}`, { method: 'DELETE' })
    go('/designs')
  }

  const items: MenuItem[] = [
    ...(editable ? [{ label: 'Rename', onSelect: () => { setName(s.title); setRenaming(true) } }] : []),
    { label: 'New design', onSelect: () => go('/') },
    ...(s.role !== 'view' || user ? [{ label: 'Make a copy', onSelect: copy }] : []),
    ...(user?.is_admin && !s.guest ? [{ label: 'Save as template…', onSelect: () => editorModals.show('template') }] : []),
    { type: 'sep' },
    { label: 'Show rulers', hint: '⇧⌘R', checked: s.rulers, onSelect: () => s.set({ rulers: !s.rulers }) },
    { label: 'Snap to guides', checked: s.snapping, onSelect: () => s.set({ snapping: !s.snapping }) },
    { type: 'sep' },
    { label: 'Download', onSelect: () => editorModals.show('export') },
    { label: 'Copy page as image', onSelect: () => void copyPageImage() },
    { label: 'Print', onSelect: () => editorModals.show('print') },
    ...(s.role !== 'view' ? [{ label: 'Save a backup file', onSelect: () => void saveBackup() }] : []),
    ...(editable && !s.guest ? [{ label: 'Copies from a spreadsheet…', onSelect: () => editorModals.show('copies') }] : []),
    ...(editable && !s.guest ? [{ label: 'Version history', onSelect: () => s.set({ panel: 'history' }) }] : []),
    ...(editable ? [{ label: 'Find and replace text', hint: '⌘F', onSelect: () => editorModals.show('find') }] : []),
    ...(s.role === 'owner' ? [{ type: 'sep' as const }, { label: 'Move to trash', danger: true, onSelect: trash }] : []),
    { type: 'sep' },
    { label: 'Accessibility', onSelect: () => editorModals.show('accessibility') },
    { label: 'Keyboard shortcuts', hint: '?', onSelect: () => editorModals.show('keys') },
  ]
  return (
    <>
      <MenuTrigger label="File">{(close) => <MenuList items={items} onClose={close} />}</MenuTrigger>
      <Modal
        open={renaming}
        onClose={() => setRenaming(false)}
        title="Rename design"
        footer={<><Button onClick={() => setRenaming(false)}>Cancel</Button><Button variant="primary" onClick={() => { void renameDesign(name); setRenaming(false) }}>Save</Button></>}
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { void renameDesign(name); setRenaming(false) } }} />
      </Modal>
    </>
  )
}

function ResizeMenu() {
  return <MenuTrigger label="Resize">{(close) => <ResizeBody close={close} />}</MenuTrigger>
}

// mounted each time the menu opens, so it starts from the current page's size
function ResizeBody({ close }: { close: () => void }) {
  const page = usePage()
  const [w, setW] = useState(page?.width ?? 1080)
  const [h, setH] = useState(page?.height ?? 1080)
  const [all, setAll] = useState(true)
  const [mode, setMode] = useState<ReshapeMode>(() => (localStorage.getItem('krevaya-app.reshape') === 'uniform' ? 'uniform' : 'reflow'))
  const pages = useEditor((s) => s.doc?.getSnapshot().pages.length ?? 1)
  return (
    <div className="w-[320px] p-4">
      <p className="text-[13px] font-semibold mb-2">Custom size</p>
      <div className="flex items-center gap-2 mb-3">
        <Input type="number" value={w} min={16} max={8000} onChange={(e) => setW(Number(e.target.value))} aria-label="Width" />
        <span className="text-muted">×</span>
        <Input type="number" value={h} min={16} max={8000} onChange={(e) => setH(Number(e.target.value))} aria-label="Height" />
        <span className="text-[12px] text-muted">px</span>
      </div>
      <div className="max-h-[260px] overflow-y-auto scroll-thin -mx-1 mb-3">
        {FORMATS.map((f) => (
          <button
            key={f.id}
            onClick={() => {
              setW(f.width)
              setH(f.height)
            }}
            className={cx('w-full flex justify-between px-2.5 h-8 rounded-lg text-[13px]', f.width === w && f.height === h ? 'bg-accent-wash text-accent' : 'hover:bg-hover')}
          >
            <span>{f.label}</span>
            <span className="text-faint text-[12px]">{f.width} × {f.height}</span>
          </button>
        ))}
      </div>
      <label className="flex items-start gap-2 text-[13px] text-ink">
        <input type="checkbox" className="mt-0.5" checked={mode === 'reflow'} onChange={(e) => setMode(e.target.checked ? 'reflow' : 'uniform')} />
        <span>
          Move things to suit the new shape
          <span className="block text-[12px] text-muted mt-0.5 mb-3">
            {mode === 'reflow' ? 'Text and pictures shift into the extra room; backgrounds stretch to cover.' : 'Off: the page keeps its proportions and sits in the middle at the new size.'}
          </span>
        </span>
      </label>
      {pages > 1 && (
        <label className="flex items-center gap-2 text-[13px] mb-3">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Resize all {pages} pages
        </label>
      )}
      <Button
        variant="primary"
        className="w-full"
        disabled={w < 16 || h < 16 || w > 8000 || h > 8000}
        onClick={() => {
          resizePages(w, h, all, mode)
          try {
            localStorage.setItem('krevaya-app.reshape', mode)
          } catch {
            // private mode; the default is fine
          }
          close()
        }}
      >
        Resize
      </Button>
    </div>
  )
}
