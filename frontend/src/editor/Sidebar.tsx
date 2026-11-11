import { Icon } from '@/components/icons'
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { Spinner } from '@/components/ui/kit'
import { useEditor, type PaneId } from '@/stores/editor'

type PaneDef = { title: string; hint: string; C: LazyExoticComponent<ComponentType> }

const P = (title: string, hint: string, load: () => Promise<{ default: ComponentType }>): PaneDef => ({ title, hint, C: lazy(load) })

export const PANES: Record<Exclude<PaneId, null>, PaneDef> = {
  templates: P('Templates', 'Find a starting point for your next design.', () => import('./sidebar/StartersPane')),
  elements: P('Elements', 'Shapes, lines, icons, stickers and more. Click one to add it.', () => import('./sidebar/ElementsPane')),
  text: P('Text', 'Headlines, captions and paragraphs, plus font pairs to start from.', () => import('./sidebar/TypePane')),
  uploads: P('Uploads', 'Your photos and logos, ready to drop in.', () => import('./sidebar/UploadsPane')),
  photos: P('Photos', 'Search free stock photos.', () => import('./sidebar/StockPhotosPane')),
  brand: P('Brand', 'Your colors, fonts and logos.', () => import('./sidebar/BrandKitPane')),
  effects: P('Effects', 'Shadows, outlines and other text effects.', () => import('./sidebar/EffectsPane')),
  filters: P('Photo', 'Adjust, filter and crop the selected photo.', () => import('./sidebar/PhotoTunePane')),
  animate: P('Animate', 'Entrances, exits and loops for slideshows and videos.', () => import('./sidebar/MotionPane')),
  audio: P('Audio', 'Background music, sound cues and your own voice.', () => import('./sidebar/SoundPane')),
  position: P('Position', 'Arrange, align and reorder your layers.', () => import('./sidebar/ArrangePane')),
  layers: P('Layers', 'Everything on this page, front at the top.', () => import('./sidebar/ArrangePane')),
  comments: P('Comments', 'Pin feedback to a spot on the page.', () => import('./sidebar/FeedbackPane')),
  background: P('Background', 'Color, gradient or photo behind the page.', () => import('./sidebar/PageFillPane')),
  notes: P('Notes', 'Speaker notes for this page.', () => import('./sidebar/NotesPane')),
  history: P('Version history', 'Go back to an earlier version.', () => import('./sidebar/VersionsPane')),
  draw: P('Elements', '', () => import('./sidebar/ElementsPane')),
}

export function Sidebar() {
  const panel = useEditor((s) => s.panel)
  const close = () => useEditor.setState({ panel: null })
  if (!panel) return null
  const def = PANES[panel]
  return (
    <aside className="w-[320px] shrink-0 border-r border-line bg-surface flex flex-col min-h-0" aria-label={def.title}>
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">{def.title}</h2>
          {def.hint && <p className="text-[13px] text-muted mt-1 leading-snug">{def.hint}</p>}
        </div>
        <button onClick={close} aria-label="Close panel" className="h-8 w-8 -mr-1 rounded-lg text-muted hover:bg-hover flex items-center justify-center">
          <Icon name="chevron-left" size={18} />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scroll-thin px-4 pb-6">
        <Suspense fallback={<div className="py-10 flex justify-center"><Spinner /></div>}>
          <def.C />
        </Suspense>
      </div>
    </aside>
  )
}
