export type SelectionMode = "single" | "multi"

export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

export interface SelectionState<TKey = string | number> {
  /** Selected keys sorted by key; their order does not indicate selection recency. */
  selected: TKey[]
  selectedCount: number
  anchor: number | null
  /** Logical navigation index, which may identify an unselected item. */
  focused: number | null
  mode: SelectionMode
  count: number
  marqueeing: boolean
  marquee: SelectionRect | null
}

export interface SelectionError {
  id: string
  message: string
  metadata: unknown
}

export interface SelectionConfig<TKey = string | number> {
  onChange?: (state: SelectionState<TKey>) => void
  onError?: (error: SelectionError) => void
  /** Handles Enter without changing selection; the consumer chooses the action. */
  onEnter?: (context: { state: SelectionState<TKey>; event: KeyboardEvent }) => void
  /** Requests DOM focus after arrow navigation; the consumer moves focus and scrolls. */
  onFocusRequest?: (context: { index: number; event: KeyboardEvent }) => void
  count?: number
  getItemKey?: (index: number) => TKey
  mode?: SelectionMode
  container?: HTMLElement | null
  keyboard?: boolean
  /** Returns a positive integer column count (1 for a list); unused when itemSelector supplies the layout. */
  calculateColumnCount?: () => number
  marquee?: boolean
  collectIndicesInRect?: ((rect: SelectionRect) => number[]) | null
  /**
   * Matches one rendered element per configured item, covering the complete
   * collection in logical index order (0 through count - 1). Match positions
   * supply indices for native focus tracking and default marquee hit testing;
   * the matched layout also supplies the grid column count.
   *
   * For virtualized collections, omit this option and keep count/getItemKey
   * based on the complete collection. Call setFocused with the logical index
   * when native focus changes, return logical indices from collectIndicesInRect
   * for marquee selection, and provide calculateColumnCount for grids. In
   * onFocusRequest, render the requested logical item if needed, then move DOM
   * focus and scroll in the consumer.
   */
  itemSelector?: string | null
}

export interface SelectionEngine<TKey = string | number> {
  getState(): SelectionState<TKey>
  subscribe(listener: (state: SelectionState<TKey>) => void): () => void
  /** Updates logical focus only. Pass null to clear it; invalid indices are ignored. */
  setFocused(index: number | null): void
  /**
   * Resolves a click from an item index and normalized modifier flags.
   * Set meta for either Command or Ctrl; set shift from the event's Shift flag.
   * @example
   * selection.select(index, {
   *   meta: event.metaKey || event.ctrlKey,
   *   shift: event.shiftKey
   * });
   */
  select(index: number, modifiers?: { shift?: boolean; meta?: boolean }): void
  toggle(index: number): void
  deselect(index: number): void
  selectRange(fromIndex: number, toIndex: number): void
  selectAll(): void
  clear(): void
  /**
   * Checks membership by item key, using the same keys stored in state.selected.
   * To query a logical index, resolve it with the configured getItemKey first.
   * @example
   * selection.select(index);
   * selection.isSelected(getItemKey(index)); // true
   */
  isSelected(key: TKey): boolean
  destroy(): void
}

export function createSelection<TKey = string | number>(config?: SelectionConfig<TKey>): SelectionEngine<TKey>
