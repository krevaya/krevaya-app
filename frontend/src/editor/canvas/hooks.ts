import type { ComponentType } from 'react'
import type { CanvasEngine, View } from './engine'

export type OverlayProps = { engine: CanvasEngine; view: View }

/**
 * Extension points for features that draw on top of the canvas (crop handles,
 * comment pins, other people's cursors) or want first go at a click on it.
 */
export const canvasHooks: {
  overlays: Array<ComponentType<OverlayProps>>
  /** Return true to swallow the click. Coordinates are in page units. */
  pointer: ((x: number, y: number, e: PointerEvent) => boolean) | null
} = {
  overlays: [],
  pointer: null,
}

export function addOverlay(c: ComponentType<OverlayProps>) {
  if (!canvasHooks.overlays.includes(c)) canvasHooks.overlays.push(c)
}
