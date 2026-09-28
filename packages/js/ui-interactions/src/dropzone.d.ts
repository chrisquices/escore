export interface DropzoneState {
  files: File[]
  count: number
  totalSize: number
  draggingOver: boolean
  disabled: boolean
}

export interface DropzoneError {
  id: string
  message: string
  metadata: {
    files: File[]
  } | null
}

export interface DropzoneAddResult {
  accepted: File[]
  errors: DropzoneError[]
}

export interface DropzoneConfig {
  onChange?: (state: DropzoneState) => void
  onError?: (error: DropzoneError) => void
  accept?: string[]
  exclude?: string[]
  minSize?: number
  maxSize?: number
  maxFiles?: number
  maxTotalSize?: number
  multiple?: boolean
  openOnClick?: boolean
  disabled?: boolean
  dedupe?: boolean
  videoPreview?: boolean
  generateImageThumbnail?: boolean
  generateVideoThumbnail?: boolean
}

export interface DropzoneEngine {
  getState(): DropzoneState
  subscribe(listener: (state: DropzoneState) => void): () => void
  addFiles(files: File | FileList | File[]): DropzoneAddResult
  removeFile(file: File): boolean
  clearFiles(): void
  replaceFile(oldFile: File, newFile: File): boolean
  getFileSize(file: File): { size: number; sizeFormatted: string }
  openFilePicker(): void
  createThumbnail(file: File): Promise<string | null>
  createVideoPreview(file: File): string | null
  setDisabled(value: boolean): void
  destroy(): void
}

export function createDropzone(element: HTMLElement, config?: DropzoneConfig): DropzoneEngine
