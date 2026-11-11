import { useState } from 'react'
import { Button } from '@/components/ui/kit'
import { Modal } from '@/components/ui/Flyout'
import { qrSvg, QR_DEFAULTS, type QrOptions } from '@/content/elements/qr'
import type { SvgElement } from '@/doc/schema'
import { selected, updateElement } from '@/editor/actions'
import type { ModalProps } from '@/editor/modals'
import { QrForm } from './QrForm'

export default function QrModal({ onClose }: ModalProps) {
  const [target] = useState(() => selected().find((e): e is SvgElement => e.type === 'svg' && e.kind === 'qr'))
  const [value, setValue] = useState<QrOptions>(() => target?.qr ?? QR_DEFAULTS)
  if (!target) {
    return (
      <Modal open onClose={onClose} title="QR code" width={400}>
        <p className="text-[13px] text-muted">Select a QR code on the page first, or add one from Elements.</p>
      </Modal>
    )
  }
  const save = () => {
    updateElement(target.id, { svg: qrSvg(value), qr: value } as Partial<SvgElement>)
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Edit QR code"
      width={400}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!value.value.trim()}>Save</Button>
        </>
      )}
    >
      <QrForm value={value} onChange={setValue} />
    </Modal>
  )
}
