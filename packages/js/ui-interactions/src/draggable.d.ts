export type DraggableAxis = "both" | "x" | "y"
export type DraggableBounds =
  | "none"
  | "parent"
  | "viewport"
  | HTMLElement
  | { top: number; left: number; right: number; bottom: number }
export type DraggableResizeSide = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w"

export interface DraggableState {
  x: number
  y: number
  dragging: boolean
  axis: DraggableAxis
  disabled: boolean
  canDrag: boolean
  boundsMode: "none" | "parent" | "viewport" | "custom"
  resizable: boolean
  resizing: boolean
  resizeSide: DraggableResizeSide | null
  width: number
  height: number
  canResize: boolean
  cursor: string
  transform: string
}

export interface DraggableError {
  id: string
  message: string
  metadata: unknown
}

export interface DraggableConfig {
  onChange?: (state: DraggableState) => void
  onError?: (error: DraggableError) => void
  handle?: string | HTMLElement | null
  axis?: DraggableAxis
  bounds?: DraggableBounds
  threshold?: number
  disabled?: boolean
  resizable?: boolean
  resizeHandles?: DraggableResizeSide[]
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  aspectRatio?: "auto" | number | null
  resizeEdgeSize?: number
}

export interface DraggableEngine {
  getState(): DraggableState
  subscribe(listener: (state: DraggableState) => void): () => void
  setPosition(x: number, y: number): void
  reset(): void
  setDisabled(value: boolean): void
  setSize(width: number, height: number): void
  destroy(): void
}

export function createDraggable(element: HTMLElement, config?: DraggableConfig): DraggableEngine
