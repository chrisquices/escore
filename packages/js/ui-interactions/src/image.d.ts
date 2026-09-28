export type ImageFitMode = "contain" | "cover" | "actual"
export type ImageMinZoom = "fit" | number
export type ImagePanBounds = "contain" | "free"
/** Image assets only. SVG files use HTMLImageElement; direct SVG nodes and video sources are unsupported. */
export type ImageLayerSource = string | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas | ImageBitmap
export type ImageLayerPaintOperation = ImageLayerPaintBrushOperation | ImageLayerPaintPencilOperation | ImageLayerPaintFillOperation | ImageLayerPaintGradientOperation
export type ImageSelection = ImageRectangleSelection | ImageLassoSelection

export interface ImageLayerTransform {
  x: number
  y: number
  scaleX: number
  scaleY: number
  rotation: number
  flipX: boolean
  flipY: boolean
  perspective: ImageLayerPerspective | null
}

export interface ImageLayerPerspective {
  topLeft: {x: number; y: number}
  topRight: {x: number; y: number}
  bottomRight: {x: number; y: number}
  bottomLeft: {x: number; y: number}
}

export interface ImageLayerMaskOperation {
  type: "erase" | "restore"
  points: {x: number; y: number}[]
  size: number
  hardness: number
  opacity: number
  /** Layer coordinates; omitted uses the document selection, null is unrestricted. */
  selection?: ImageSelection | null
}

export interface ImageLayerMask {
  enabled: boolean
  operations: ImageLayerMaskOperation[]
  canUndo: boolean
  canRedo: boolean
}

export interface ImageLayerAdjustmentValues {
  exposure: number
  brightness: number
  contrast: number
  highlights: number
  shadows: number
  temperature: number
  tint: number
  saturation: number
  vibrance: number
  clarity: number
  sharpness: number
}

export interface ImageLayerAdjustments {
  enabled: boolean
  values: ImageLayerAdjustmentValues
}

export interface ImageLayerLiquifyOperation {
  type: "push" | "restore" | "shrink" | "bloat" | "twirl"
  points: {x: number; y: number}[]
  size: number
  strength: number
  density: number
  rate: number
  /** Layer coordinates; omitted uses the document selection, null is unrestricted. */
  selection?: ImageSelection | null
}

export interface ImageLayerLiquify {
  enabled: boolean
  operations: ImageLayerLiquifyOperation[]
  canUndo: boolean
  canRedo: boolean
}

export interface ImageLayerPaintBrushOperation {
  type: "brush"
  points: {x: number; y: number}[]
  size: number
  hardness: number
  opacity: number
  color: string
  /** Layer coordinates; omitted uses the document selection, null is unrestricted. */
  selection?: ImageSelection | null
}

export interface ImageLayerPaintPencilOperation {
  type: "pencil"
  points: {x: number; y: number}[]
  size: number
  opacity: number
  color: string
  /** Layer coordinates; omitted uses the document selection, null is unrestricted. */
  selection?: ImageSelection | null
}

export interface ImageLayerPaintFillOperation {
  type: "fill"
  x: number
  y: number
  color: string
  opacity: number
  tolerance: number
  /** Layer coordinates; omitted uses the document selection, null is unrestricted. */
  selection?: ImageSelection | null
}

export interface ImageLayerPaintGradientOperation {
  type: "gradient"
  startX: number
  startY: number
  endX: number
  endY: number
  startColor: string
  endColor: string
  opacity: number
  /** Layer coordinates; omitted uses the document selection, null is unrestricted. */
  selection?: ImageSelection | null
}

export interface ImageLayerPaint {
  enabled: boolean
  operations: ImageLayerPaintOperation[]
  canUndo: boolean
  canRedo: boolean
}

export interface ImageLayerRetouchOperation {
  type: "clone" | "heal"
  sourceX: number
  sourceY: number
  points: {x: number; y: number}[]
  size: number
  hardness: number
  opacity: number
  /** Layer coordinates; omitted uses the document selection, null is unrestricted. */
  selection?: ImageSelection | null
}

export interface ImageLayerRetouch {
  enabled: boolean
  operations: ImageLayerRetouchOperation[]
  canUndo: boolean
  canRedo: boolean
}

export interface ImageLayer {
  id: string
  source: ImageLayerSource
  sourceReference: string | null
  name: string
  visible: boolean
  opacity: number
  transform: ImageLayerTransform
  mask: ImageLayerMask | null
  adjustments: ImageLayerAdjustments | null
  liquify: ImageLayerLiquify | null
  paint: ImageLayerPaint | null
  retouch: ImageLayerRetouch | null
}

export interface ImageLayerConfig {
  source: ImageLayerSource
  sourceReference?: string
  name?: string
  visible?: boolean
  opacity?: number
}

export interface ImageRectangleSelection {
  type: "rectangle"
  x: number
  y: number
  width: number
  height: number
}

export interface ImageLassoSelection {
  type: "lasso"
  points: {x: number; y: number}[]
}

export interface ImageCrop {
  x: number
  y: number
  width: number
  height: number
}

export interface ImageSerializedLayerMask {
  enabled: boolean
  operations: ImageLayerMaskOperation[]
  operationIndex: number
}

export interface ImageSerializedLayerLiquify {
  enabled: boolean
  operations: ImageLayerLiquifyOperation[]
  historyIndex: number
}

export interface ImageSerializedLayerPaint {
  enabled: boolean
  operations: ImageLayerPaintOperation[]
  historyIndex: number
}

export interface ImageSerializedLayerRetouch {
  enabled: boolean
  operations: ImageLayerRetouchOperation[]
  historyIndex: number
}

export interface ImageSerializedLayer {
  id: string
  source: string
  name: string
  visible: boolean
  opacity: number
  transform: ImageLayerTransform
  mask: ImageSerializedLayerMask | null
  adjustments: ImageLayerAdjustments | null
  liquify: ImageSerializedLayerLiquify | null
  paint: ImageSerializedLayerPaint | null
  retouch: ImageSerializedLayerRetouch | null
}

export interface ImageSerializedDocument {
  canvasWidth: number
  canvasHeight: number
  canvasBackground: string
  layers: ImageSerializedLayer[]
  selection: ImageSelection | null
  crop: ImageCrop | null
  straighten: number
}

export interface ImageState {
  src: string
  loading: boolean
  loaded: boolean
  error: string | null
  naturalWidth: number
  naturalHeight: number
  canvasWidth: number
  canvasHeight: number
  canvasBackground: string
  layers: ImageLayer[]
  selection: ImageSelection | null
  crop: ImageCrop | null
  straighten: number
  viewportWidth: number
  viewportHeight: number
  scale: number
  fitScale: number
  fillScale: number
  minScale: number
  maxScale: number
  zoomPercent: number
  offsetX: number
  offsetY: number
  rotation: number
  flipX: boolean
  flipY: boolean
  fitMode: ImageFitMode
  transform: string
  isFitted: boolean
  isActualSize: boolean
  isZoomed: boolean
  canUndo: boolean
  canRedo: boolean
  canZoomIn: boolean
  canZoomOut: boolean
  canPan: boolean
  isFullscreen: boolean
  fullscreenSupported: boolean
}

export interface ImageError {
  id: string
  message: string
  metadata: unknown
}

export interface ImageShortcut {
  id: string
  keys: string[]
  message: string
}

export interface ImageExportOptions {
  type?: "image/png" | "image/jpeg" | "image/webp"
  quality?: number
}

export interface ImageConfig {
  onChange?: (state: ImageState) => void
  onError?: (error: ImageError) => void
  viewport?: HTMLElement
  src?: string
  canvasWidth?: number
  canvasHeight?: number
  canvasBackground?: string
  fitMode?: ImageFitMode
  minZoom?: ImageMinZoom
  maxZoom?: number
  zoomStep?: number
  panBounds?: ImagePanBounds
  rotationStep?: number
  wheelZoom?: boolean
  dragPan?: boolean
  pinchZoom?: boolean
  doubleClickZoom?: boolean
  keyboardShortcuts?: boolean
}

export interface ImageEngine {
  getState(): ImageState
  subscribe(listener: (state: ImageState) => void): () => void
  retry(): boolean
  setCanvasSize(width: number, height: number): boolean
  resizeDocument(width: number, height: number): boolean
  setCanvasBackground(background: string): boolean
  addLayer(layer: ImageLayerConfig): string | false
  resolveLayerSource(id: string, source: Exclude<ImageLayerSource, string>): boolean
  removeLayer(id: string): boolean
  rasterizeLayer(id: string): boolean
  setLayerVisibility(id: string, visible: boolean): boolean
  setLayerOpacity(id: string, opacity: number): boolean
  setLayerTransform(id: string, transform: Partial<ImageLayerTransform>): boolean
  resizeLayer(id: string, width: number, height: number, preserveAspectRatio?: boolean): boolean
  setLayerPerspective(id: string, perspective: ImageLayerPerspective): boolean
  clearLayerPerspective(id: string): boolean
  createLayerMask(id: string): boolean
  removeLayerMask(id: string): boolean
  setLayerMaskEnabled(id: string, enabled: boolean): boolean
  addLayerMaskOperation(id: string, operation: ImageLayerMaskOperation): boolean
  undoLayerMask(id: string): boolean
  redoLayerMask(id: string): boolean
  canUndoLayerMask(id: string): boolean
  canRedoLayerMask(id: string): boolean
  createLayerAdjustments(id: string): boolean
  removeLayerAdjustments(id: string): boolean
  setLayerAdjustment(id: string, name: keyof ImageLayerAdjustmentValues, value: number): boolean
  setLayerAdjustmentsEnabled(id: string, enabled: boolean): boolean
  createLayerLiquify(id: string): boolean
  removeLayerLiquify(id: string): boolean
  setLayerLiquifyEnabled(id: string, enabled: boolean): boolean
  addLayerLiquifyOperation(id: string, operation: ImageLayerLiquifyOperation): boolean
  undoLayerLiquify(id: string): boolean
  redoLayerLiquify(id: string): boolean
  canUndoLayerLiquify(id: string): boolean
  canRedoLayerLiquify(id: string): boolean
  createLayerPaint(id: string): boolean
  removeLayerPaint(id: string): boolean
  setLayerPaintEnabled(id: string, enabled: boolean): boolean
  addLayerPaintOperation(id: string, operation: ImageLayerPaintOperation): boolean
  undoLayerPaint(id: string): boolean
  redoLayerPaint(id: string): boolean
  canUndoLayerPaint(id: string): boolean
  canRedoLayerPaint(id: string): boolean
  createLayerRetouch(id: string): boolean
  removeLayerRetouch(id: string): boolean
  setLayerRetouchEnabled(id: string, enabled: boolean): boolean
  addLayerRetouchOperation(id: string, operation: ImageLayerRetouchOperation): boolean
  undoLayerRetouch(id: string): boolean
  redoLayerRetouch(id: string): boolean
  canUndoLayerRetouch(id: string): boolean
  canRedoLayerRetouch(id: string): boolean
  moveLayer(id: string, index: number): boolean
  setSelection(selection: ImageSelection): boolean
  clearSelection(): boolean
  setCrop(crop: ImageCrop): boolean
  clearCrop(): boolean
  setStraighten(degrees: number): boolean
  resetStraighten(): boolean
  undo(): boolean
  redo(): boolean
  canUndo(): boolean
  canRedo(): boolean
  beginTransaction(): boolean
  commitTransaction(): boolean
  cancelTransaction(): boolean
  serialize(): ImageSerializedDocument
  load(serialized: ImageSerializedDocument): boolean
  render(target: HTMLCanvasElement): boolean
  /** Bounds must be finite and at least 1 pixel; fractional bounds use their whole-pixel portion. */
  renderPreview(target: HTMLCanvasElement, maxWidth: number, maxHeight: number): boolean
  exportImage(options?: ImageExportOptions): Promise<Blob>
  pickColor(x: number, y: number): {r: number; g: number; b: number; a: number; hex: string} | null | false
  viewportToCanvas(x: number, y: number): {x: number; y: number}
  canvasToViewport(x: number, y: number): {x: number; y: number}
  canvasToLayer(id: string, x: number, y: number): {x: number; y: number} | false
  layerToCanvas(id: string, x: number, y: number): {x: number; y: number} | false
  setZoom(value: number): boolean
  zoomIn(factor?: number): boolean
  zoomOut(factor?: number): boolean
  zoomToPoint(value: number, clientX: number, clientY: number): boolean
  setFitMode(mode: ImageFitMode): boolean
  actualSize(): boolean
  reset(): boolean
  setPan(x: number, y: number): boolean
  setRotation(degrees: number): boolean
  rotateClockwise(): boolean
  rotateCounterClockwise(): boolean
  setFlipHorizontal(enabled: boolean): boolean
  setFlipVertical(enabled: boolean): boolean
  toggleFlipHorizontal(): boolean
  toggleFlipVertical(): boolean
  enterFullscreen(): Promise<boolean>
  exitFullscreen(): Promise<boolean>
  toggleFullscreen(): void
  setKeyboardShortcuts(enabled: boolean): boolean
  listKeyboardShortcuts(): ImageShortcut[]
  destroy(): void
}

export function createImage(image: HTMLImageElement, config?: ImageConfig): ImageEngine
