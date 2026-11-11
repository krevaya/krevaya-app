import { editorModals, onDemand } from '@/editor/modals'

// both pull in pdf-lib, fflate and the SVG writer
editorModals.add('export', onDemand(() => import('./ExportModal')))
editorModals.add('print', onDemand(() => import('./PrintModal')))
