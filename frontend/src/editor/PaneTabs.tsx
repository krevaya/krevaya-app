import { RailIcon } from '@/components/icons'
import type { ReactNode } from 'react'
import { cx } from '@/components/ui/kit'
import { canEdit, useEditor, type PaneId } from '@/stores/editor'

type Tool = { id: Exclude<PaneId, null>; label: string; icon: ReactNode; edit?: boolean; account?: boolean; comment?: boolean }

const TOOLS: Tool[] = [
  { id: 'templates', label: 'Templates', icon: <RailIcon name="templates" size={20} />, edit: true },
  { id: 'brand', label: 'Brand', icon: <RailIcon name="brand" size={20} />, edit: true },
  { id: 'elements', label: 'Elements', icon: <RailIcon name="elements" size={20} />, edit: true },
  { id: 'text', label: 'Text', icon: <RailIcon name="text" size={20} />, edit: true },
  { id: 'photos', label: 'Photos', icon: <RailIcon name="photos" size={20} />, edit: true },
  { id: 'uploads', label: 'Uploads', icon: <RailIcon name="uploads" size={20} />, edit: true },
  { id: 'position', label: 'Position', icon: <RailIcon name="position" size={20} /> },
  { id: 'effects', label: 'Effects', icon: <RailIcon name="effects" size={20} />, edit: true },
  { id: 'audio', label: 'Audio', icon: <RailIcon name="audio" size={20} />, edit: true },
  { id: 'animate', label: 'Animate', icon: <RailIcon name="animate" size={20} />, edit: true },
  { id: 'comments', label: 'Comments', icon: <RailIcon name="comments" size={20} />, account: true, comment: true },
]

export function PaneTabs() {
  const panel = useEditor((s) => s.panel)
  const role = useEditor((s) => s.role)
  const guest = useEditor((s) => s.guest)
  const open = useEditor((s) => s.openPanel)
  const tools = TOOLS.filter((t) => (!t.edit || canEdit(role)) && (!t.account || !guest) && (!t.comment || role !== 'view'))
  return (
    <nav className="w-[72px] shrink-0 border-r border-line bg-surface flex flex-col items-center gap-1 py-2.5 overflow-y-auto scroll-thin" aria-label="Tools">
      {tools.map((t) => (
        <button
          key={t.id}
          onClick={() => open(t.id)}
          aria-pressed={panel === t.id}
          className={cx(
            'w-[60px] py-2 flex flex-col items-center gap-1 rounded-control text-[11px] transition',
            panel === t.id ? 'bg-accent-wash text-accent font-medium' : 'text-ink-2 hover:bg-hover',
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </nav>
  )
}
