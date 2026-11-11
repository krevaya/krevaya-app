import { editorModals, onDemand } from '@/editor/modals'

// the QR encoder only loads when someone edits a code
editorModals.add('qr', onDemand(() => import('./QrModal')))
