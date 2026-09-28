export interface DroppablePoint {
  x: number
  y: number
}

export interface DroppableState<TPayload = unknown, TTarget = unknown> {
  dragging: boolean
  payload: TPayload | null
  point: DroppablePoint | null
  origin: DroppablePoint | null
  activeTarget: TTarget | null
  canDropHere: boolean
}

export interface DroppableError {
  id: string
  message: string
  metadata: unknown
}

export interface DroppableConfig<TPayload = unknown, TTarget = unknown> {
  onChange?: (state: DroppableState<TPayload, TTarget>) => void
  onError?: (error: DroppableError) => void
  onDrop?: (payload: TPayload, target: TTarget) => void
  container: HTMLElement
  getPayload?: (event: PointerEvent) => TPayload | null | undefined
  canDrop?: (payload: TPayload, target: TTarget) => boolean
  dragThreshold?: number
}

export interface DroppableEngine<TPayload = unknown, TTarget = unknown> {
  getState(): DroppableState<TPayload, TTarget>
  subscribe(listener: (state: DroppableState<TPayload, TTarget>) => void): () => void
  registerTarget(element: HTMLElement, data: TTarget): () => void
  destroy(): void
}

export function createDroppable<TPayload = unknown, TTarget = unknown>(
  config: DroppableConfig<TPayload, TTarget>,
): DroppableEngine<TPayload, TTarget>
