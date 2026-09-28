import type {
  ImageLayer,
  ImageLayerSource,
  ImageSerializedDocument,
  ImageSerializedLayerMask,
  ImageSerializedLayerLiquify,
  ImageSerializedLayerPaint,
  ImageSerializedLayerRetouch,
  ImageState
} from '../image.js'

/** Editable layer state retains the full modifier history, including redo entries. */
export interface LayerState extends Omit<ImageLayer, 'mask' | 'liquify' | 'paint' | 'retouch'> {
  mask: ImageSerializedLayerMask | null
  liquify: ImageSerializedLayerLiquify | null
  paint: ImageSerializedLayerPaint | null
  retouch: ImageSerializedLayerRetouch | null
}

export interface DocumentState extends Omit<ImageSerializedDocument, 'layers'> {
  layers: LayerState[]
}

export type DocumentSnapshot = Pick<ImageState, 'canvasWidth' | 'canvasHeight' | 'canvasBackground' | 'layers' | 'selection' | 'crop' | 'straighten'>

export type LayerSource = Exclude<ImageLayerSource, string>

export interface LayerProxy {
  source: LayerSource
  src: string | undefined
  width: number
  height: number
  canvas: HTMLCanvasElement
}

export interface ViewportSize {
  width: number
  height: number
  centerX: number
  centerY: number
}

export interface FullscreenViewport extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

export interface ImageDocument extends Document {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}
