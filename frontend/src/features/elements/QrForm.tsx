import { useMemo } from 'react'
import { ColorWell } from '@/components/ui/ColorPicker'
import { ChoiceRow } from '@/components/ui/kit'
import { qrSvg, type QrOptions } from '@/content/elements/qr'
import { svgDataUrl } from '@/render/assets'

const LEVELS: Array<{ value: QrOptions['level']; label: string }> = [
  { value: 'L', label: 'Low' },
  { value: 'M', label: 'Medium' },
  { value: 'Q', label: 'High' },
  { value: 'H', label: 'Max' },
]

export function QrForm({ value, onChange, preview = true }: { value: QrOptions; onChange: (v: QrOptions) => void; preview?: boolean }) {
  const set = (patch: Partial<QrOptions>) => onChange({ ...value, ...patch })
  const src = useMemo(() => (preview ? svgDataUrl(qrSvg(value)) : ''), [preview, value])
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5 text-[13px] text-ink-2">
        Link or text
        <textarea
          value={value.value}
          onChange={(e) => set({ value: e.target.value })}
          rows={2}
          placeholder="https://example.com"
          className="w-full rounded-control border border-line-2 bg-surface text-ink text-sm px-3 py-2 outline-none focus:border-accent-soft focus:shadow-ring resize-none"
        />
      </label>
      <div className="flex items-center gap-4 text-[13px] text-ink-2">
        <span className="flex items-center gap-2">Code <ColorWell value={value.fg} onChange={(c) => set({ fg: c as string })} label="Code color" size="sm" /></span>
        <span className="flex items-center gap-2">Background <ColorWell value={value.bg} onChange={(c) => set({ bg: c as string })} label="Background color" size="sm" /></span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] text-ink-2">Error correction</span>
        <ChoiceRow value={value.level} onChange={(level) => set({ level })} options={LEVELS} />
        <span className="text-[12px] text-muted">Higher levels still scan when part of the code is covered, but make it denser.</span>
      </div>
      {preview && (
        <div className="flex justify-center p-3 rounded-tile border border-line bg-surface-2">
          <img src={src} alt="QR code preview" className="w-36 h-36" style={{ imageRendering: 'pixelated' }} />
        </div>
      )}
    </div>
  )
}
