import { lazy, Suspense, type ComponentType } from 'react'
import { create } from 'zustand'

export type ModalProps = { onClose: () => void }

// one modal at a time; features add theirs from their register file
const known: Record<string, ComponentType<ModalProps>> = {}
const useModal = create<{ open: string | null }>(() => ({ open: null }))

export const editorModals = {
  add(name: string, c: ComponentType<ModalProps>) {
    known[name] = c
  },
  show(name: string) {
    useModal.setState({ open: name })
  },
  hide() {
    useModal.setState({ open: null })
  },
}

export function ModalOutlet() {
  const open = useModal((s) => s.open)
  const C = open ? known[open] : undefined
  return C ? <C onClose={editorModals.hide} /> : null
}

/** Wraps a lazily imported modal so heavy code only loads on first open. */
export function onDemand(load: () => Promise<{ default: ComponentType<ModalProps> }>) {
  const C = lazy(load)
  return (p: ModalProps) => (
    <Suspense fallback={null}>
      <C {...p} />
    </Suspense>
  )
}
