import { useEffect } from 'react'
import { canEdit, useEditor } from '@/stores/editor'
import {
  copySelection, cutSelection, deleteSelected, duplicateSelected, groupSelection, nudge, pasteElements, redo, reorder,
  selectAll, undo, ungroupSelection,
} from './actions'
import { getEngine } from './Canvas'
import { editorModals } from './modals'

function typing(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e) || useEditor.getState().presenting) return
      // a dialog owns the keyboard; Escape in a popover only closes the popover
      if (document.querySelector('[data-overlay="modal"]')) return
      if (e.key === 'Escape' && document.querySelector('[data-overlay]')) return
      const mod = e.metaKey || e.ctrlKey
      const k = e.key.toLowerCase()
      const s = useEditor.getState()
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (mod && k === 'y') return void (e.preventDefault(), redo())
      if (mod && k === 'c') return copySelection()
      if (mod && k === 'x') return cutSelection()
      if (mod && k === 'd') return void (e.preventDefault(), duplicateSelected())
      if (mod && k === 'a') return void (e.preventDefault(), selectAll())
      if (mod && k === 'g') return void (e.preventDefault(), e.shiftKey ? ungroupSelection() : groupSelection())
      if (mod && e.key === ']') return void (e.preventDefault(), reorder(e.altKey ? 'front' : 'forward'))
      if (mod && e.key === '[') return void (e.preventDefault(), reorder(e.altKey ? 'back' : 'backward'))
      if (mod && (k === '=' || k === '+')) return void (e.preventDefault(), s.setZoom(s.zoom * 1.2))
      if (mod && k === '-') return void (e.preventDefault(), s.setZoom(s.zoom / 1.2))
      if (mod && k === '0') {
        e.preventDefault()
        useEditor.setState({ autoFit: true })
        return getEngine()?.fit()
      }
      if (mod && e.shiftKey && k === 'r') return void (e.preventDefault(), s.set({ rulers: !s.rulers }))
      if (k === 'delete' || k === 'backspace') return void (e.preventDefault(), deleteSelected())
      if (k === 'escape') return s.select([])
      if (e.key.startsWith('Arrow') && s.selection.length) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]!
        nudge(d[0], d[1])
        return
      }
      if (mod && k === 'f' && canEdit(s.role)) return void (e.preventDefault(), editorModals.show('find'))
      if (e.key === '?') return editorModals.show('keys')
      if (k === 't' && !mod) return void s.set({ panel: 'text' })
      if (k === 'enter' && s.selection.length === 1) {
        const el = s.doc?.element(s.selection[0])
        if (el?.type === 'text' && !el.locked) {
          e.preventDefault()
          s.set({ editingId: el.id })
        }
      }
    }
    const onPaste = (e: ClipboardEvent) => {
      if (typing(e as unknown as KeyboardEvent)) return
      const text = e.clipboardData?.getData('text/plain')
      if (text) {
        try {
          const data = JSON.parse(text)
          if (data?.app === 'krevaya-app' && Array.isArray(data.elements)) {
            e.preventDefault()
            return pasteElements(data.elements)
          }
        } catch {
          // plain text: handled by the paste-text feature, or ignored
        }
      }
      if (pasteHandler && pasteHandler(e)) return
      pasteElements()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('paste', onPaste)
    }
  }, [])
}

let pasteHandler: ((e: ClipboardEvent) => boolean) | null = null

/** Uploads use this to turn pasted images and text into elements. */
export function setPasteHandler(fn: typeof pasteHandler) {
  pasteHandler = fn
}
