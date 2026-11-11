import { addOverlay, canvasHooks } from '@/editor/canvas/hooks'
import { editorModals } from '@/editor/modals'
import { currentPage } from '@/editor/actions'
import { useEditor } from '@/stores/editor'
import { CopiesModal } from './CopiesModal'
import { CommentMarkers } from './CommentMarkers'
import { useComments } from './comments'
import { FindModal } from './FindModal'
import { LiveCursors } from './presence'
import { LinksModal } from './LinksModal'
import { AccessibilityModal, SlotModal, LinkModal, KeysModal, TemplateModal } from './MiscModals'

editorModals.add('links', LinksModal)
editorModals.add('accessibility', AccessibilityModal)
editorModals.add('keys', KeysModal)
editorModals.add('find', FindModal)
editorModals.add('slot', SlotModal)
editorModals.add('link', LinkModal)
editorModals.add('template', TemplateModal)
editorModals.add('copies', CopiesModal)

addOverlay(LiveCursors)
addOverlay(CommentMarkers)

// Comment mode borrows the canvas click: the next click on the page drops a pin.
const dropPin = (x: number, y: number) => {
  const page = currentPage()
  if (!page) return false
  if (x >= 0 && y >= 0 && x <= page.width && y <= page.height) {
    useComments.setState({ draft: { pageId: page.id, x: Math.round(x), y: Math.round(y) }, activeId: null })
    useEditor.setState({ commentMode: false, selection: [] })
  }
  return true
}

let before: typeof canvasHooks.pointer = null
useEditor.subscribe((s, prev) => {
  if (s.commentMode === prev.commentMode) return
  if (s.commentMode) {
    if (canvasHooks.pointer !== dropPin) before = canvasHooks.pointer
    canvasHooks.pointer = dropPin
  } else if (canvasHooks.pointer === dropPin) {
    canvasHooks.pointer = before
    before = null
  }
})
