import { autoUpdate, flip, offset, shift, useDismiss, useFloating, useInteractions, type Placement } from '@floating-ui/react'
import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './kit'

type Place = Extract<Placement, 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end' | 'right-start' | 'bottom'>

/** A floating box anchored to an element, closed by Escape or an outside click. */
export function Flyout({ anchor, open, onClose, place = 'bottom-start', children, className }: {
  anchor: HTMLElement | null
  open: boolean
  onClose: () => void
  place?: Place
  children: ReactNode
  className?: string
}) {
  const { refs, floatingStyles, context, isPositioned } = useFloating({
    open,
    onOpenChange: (next) => !next && onClose(),
    placement: place,
    strategy: 'fixed',
    elements: { reference: anchor },
    middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const { getFloatingProps } = useInteractions([useDismiss(context)])

  if (!open) return null
  return createPortal(
    <div
      ref={refs.setFloating}
      data-overlay="popover"
      style={{ ...floatingStyles, visibility: isPositioned ? undefined : 'hidden' }}
      className={cx('z-50 rounded-card border border-line bg-surface shadow-pop', className)}
      {...getFloatingProps()}
    >
      {children}
    </div>,
    document.body,
  )
}

export type MenuItem =
  | { type?: 'item'; label: string; icon?: ReactNode; hint?: string; onSelect: () => void; danger?: boolean; disabled?: boolean; checked?: boolean }
  | { type: 'sep' }
  | { type: 'label'; label: string }

export function MenuList({ items, onClose }: { items: MenuItem[]; onClose: () => void }) {
  return (
    <div className="py-1.5 min-w-[220px]" role="menu">
      {items.map((it, i) => {
        if (it.type === 'sep') return <div key={i} className="my-1.5 mx-2 border-t border-line" />
        if (it.type === 'label') return <div key={i} className="px-3.5 pt-2 pb-1 text-[11px] uppercase tracking-wider text-faint">{it.label}</div>
        return (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              it.onSelect()
              onClose()
            }}
            className={cx(
              'w-[calc(100%-12px)] mx-1.5 flex items-center gap-2.5 px-2.5 h-8 rounded-lg text-[13px] text-left disabled:opacity-40',
              it.danger ? 'text-danger hover:bg-red-50' : 'text-ink hover:bg-hover',
            )}
          >
            <span className="w-4 flex justify-center text-muted">{it.checked ? '✓' : it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.hint && <span className="text-[11px] text-faint">{it.hint}</span>}
          </button>
        )
      })}
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 480, footer }: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  width?: number
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div data-overlay="modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" style={{ width }} className="max-w-full max-h-[90vh] flex flex-col rounded-card bg-surface border border-line shadow-pop">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[17px] font-semibold text-ink">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 rounded-lg text-muted hover:bg-hover">✕</button>
        </div>
        <div className="px-5 pb-5 overflow-y-auto scroll-thin">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-line flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
