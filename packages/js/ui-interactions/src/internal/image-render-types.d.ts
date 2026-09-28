import type {ImageLayerLiquifyOperation, ImageSelection} from '../image.js'

export interface Point {
  x: number
  y: number
}

export interface LiquifySegment extends Point {
  type: ImageLayerLiquifyOperation['type']
  radius: number
  density: number
  amount: number
  deltaX: number
  deltaY: number
  steps: number
  selection: ImageSelection | null | undefined
  index: number
}

export interface LiquifyPoints {
  segments: LiquifySegment[]
  length: number
}

export interface LiquifyPoint extends Omit<LiquifySegment, 'steps' | 'index'> {
  left: number
  top: number
  right: number
  bottom: number
}

export interface LiquifySample extends Point {
  restore: number
}

export interface LiquifyCache {
  keys: Float64Array | null
  values: Float32Array | null
  ages: Uint32Array | null
  clock: number
}

export interface LiquifySource extends Point {
  pixels: ImageData
}

export interface LiquifyTile extends Point {
  width: number
  height: number
  field: Float32Array
  scratch: Float32Array
}

export interface LiquifyFrame extends Point {
  index: number
  sourceX: number
  sourceY: number
  restore: number
  x0: number
  y0: number
  x1: number
  y1: number
  fractionX: number
  fractionY: number
  samples: Point[]
}

export type PendingLiquifyFrame = Pick<LiquifyFrame, 'index' | 'x' | 'y'> & Partial<LiquifyFrame>
