import { ColorPanel } from '@/components/ui/ColorPicker'
import type { Fill } from '@/doc/schema'
import { useEditor } from '@/stores/editor'
import { usePage } from '../hooks'

export default function PageFillPane() {
  const page = usePage()
  if (!page) return null
  const set = (v: Fill | string) => {
    const background: Fill = typeof v === 'string' ? { type: 'solid', color: v } : v
    useEditor.getState().doc?.updatePage(page.id, { background })
  }
  return (
    <div className="-mx-3.5">
      <ColorPanel value={page.background.type === 'image' ? '#ffffff' : page.background} onChange={set} gradients />
      {page.background.type === 'image' && (
        <button className="mx-3.5 text-[13px] text-accent" onClick={() => set('#ffffff')}>Remove background photo</button>
      )}
    </div>
  )
}
