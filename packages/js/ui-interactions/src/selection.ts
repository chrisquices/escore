import {callConsumer, createNotifier, createErrorReporter} from 'strata-packages/ui-interactions/internal/core';

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
    onEnter?: (context: {state: SelectionState<TKey>; event: KeyboardEvent}) => void
    /** Requests DOM focus after arrow navigation; the consumer moves focus and scrolls. */
    onFocusRequest?: (context: {index: number; event: KeyboardEvent}) => void
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
    select(index: number, modifiers?: {shift?: boolean; meta?: boolean}): void
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

const interactiveControlSelector =
    "button, a[href], input, textarea, select, option, label, summary, audio[controls], video[controls], " +
    "[role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [role='textbox'], [role='searchbox'], " +
    "[role='combobox'], [role='listbox'], [role='slider'], [role='spinbutton'], [role='tab'], " +
    "[role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], [contenteditable]:not([contenteditable='false'])";

function arrowDelta(key: string, columns: number) {
    if (key === "ArrowUp") {
        return -columns;
    }

    if (key === "ArrowDown") {
        return columns;
    }

    if (key === "ArrowLeft") {
        return -1;
    }

    if (key === "ArrowRight") {
        return 1;
    }

    return 0;
}

export function createSelection<TKey = string | number>(config: SelectionConfig<TKey> = {}): SelectionEngine<TKey> {
    if (!config || typeof config !== "object") {
        throw new TypeError("createSelection: 'config' must be an options object.");
    }

    // region ===== Config =============================================================================================
    const {
        onChange, onError, onEnter, onFocusRequest,
        count = 0,
        getItemKey = function (index) {return index as TKey;},
        mode = "multi",
        container = null,
        keyboard = true,
        calculateColumnCount = function () {return 1;},
        marquee = true,
        collectIndicesInRect = null,
        itemSelector = null
    } = config;

    validateConfig();

    function validateConfig() {

        // On Change
        if (onChange !== undefined && typeof onChange !== "function") {
            throw new TypeError("createSelection: the 'onChange' option must be a function when provided.");
        }

        // On Error
        if (onError !== undefined && typeof onError !== "function") {
            throw new TypeError("createSelection: the 'onError' option must be a function when provided.");
        }

        // On Enter
        if (onEnter !== undefined && typeof onEnter !== "function") {
            throw new TypeError("createSelection: the 'onEnter' option must be a function when provided.");
        }

        // On Focus Request
        if (onFocusRequest !== undefined && typeof onFocusRequest !== "function") {
            throw new TypeError("createSelection: the 'onFocusRequest' option must be a function when provided.");
        }

        // Count
        if (!Number.isInteger(count) || count < 0) {
            throw new TypeError("createSelection: the 'count' option must be a non-negative integer.");
        }

        // Get Item Key
        if (typeof getItemKey !== "function") {
            throw new TypeError("createSelection: the 'getItemKey' option must be a function.");
        }

        // Mode
        if (!["single", "multi"].includes(mode)) {
            throw new TypeError("createSelection: the 'mode' option must be 'single' or 'multi'.");
        }

        // Container — the element keyboard and marquee listen on; null = no keyboard/marquee
        if (container !== null && typeof container!.addEventListener !== "function") {
            throw new TypeError("createSelection: the 'container' option must be a DOM element.");
        }

        // Keyboard
        if (typeof keyboard !== "boolean") {
            throw new TypeError("createSelection: the 'keyboard' option must be a boolean.");
        }

        // Get Columns — current column count for grid-aware arrow nav (1 = a plain list)
        if (typeof calculateColumnCount !== "function") {
            throw new TypeError("createSelection: the 'calculateColumnCount' option must be a function.");
        }

        // Marquee
        if (typeof marquee !== "boolean") {
            throw new TypeError("createSelection: the 'marquee' option must be a boolean.");
        }

        // Get Indices In Rect — marquee hit-test provider (content-space rect → indices); null disables marquee-select
        if (collectIndicesInRect !== null && typeof collectIndicesInRect !== "function") {
            throw new TypeError("createSelection: the 'collectIndicesInRect' option must be a function or null.");
        }

        // Item Selector — optional DOM strategy for auto grid columns + marquee hit-testing
        if (itemSelector !== null && typeof itemSelector !== "string") {
            throw new TypeError("createSelection: the 'itemSelector' option must be a string or null.");
        }
    }

    // endregion

    // region ===== Init ===============================================================================================
    let destroyed = false; // late listeners must not still fire callbacks after teardown
    let initialized = false;

    function init() {

        // Wire up subscribers and listeners first, so nothing that follows goes unheard
        if (onChange) subscribe(onChange);

        registerAllEventListeners();

        // Respect focus that was already inside an item before the engine was created.
        handleFocusIn({target: container?.ownerDocument?.activeElement});

        // Include native focus in the single initial delivery.
        initialized = true;
        notify();
    }

    // endregion

    // region ===== Event Listeners ====================================================================================
    const cleanups: (() => void)[] = []; // teardown functions, collected so everything can be undone at once

    function registerEventListener<K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) {
        target.addEventListener(type, handler as EventListener, options);

        cleanups.push(function () {
            target.removeEventListener(type, handler as EventListener, options); // detach the exact listener that was registered
        });
    }

    function registerAllEventListeners() {
        if (!container) {
            return;
        }

        // Focus — synchronize the active item when native DOM focus moves
        registerEventListener(container, "focusin", function (event) {
            handleFocusIn(event);
        });

        // Keyboard — grid-aware selection when a focusable container is given
        registerEventListener(container, "keydown", function (event) {
            handleKeydown(event);
        });

        // Marquee — drag on empty container space to rubber-band-select
        registerEventListener(container, "pointerdown", function (event) {
            handleMarqueeDown(event);
        });

        registerEventListener(container, "pointermove", function (event) {
            handleMarqueeMove(event);
        });

        registerEventListener(container, "pointerup", function (event) {
            handleMarqueeUp(event);
        });

        registerEventListener(container, "pointercancel", function (event) {
            handleMarqueeCancel(event);
        });

        registerEventListener(container, "lostpointercapture", function (event) {
            handleMarqueeCancel(event);
        });
    }

    // endregion

    // region ===== Error Handling =====================================================================================
    const reportError = createErrorReporter(onError);

    function handleSelectionError(operation: string, cause: unknown, snapshot = marqueeSnapshot) {
        if (destroyed) return;

        if (operation === "marquee" && marqueeSnapshot === snapshot) {
            resetMarquee(true);
            notify();
        }

        if (destroyed) return;
        reportError("selection-update-failed", "The selection could not be updated.", {operation: operation, cause: cause});
    }

    // endregion

    // region ===== State ==============================================================================================
    const notifier = createNotifier(getState);
    const subscriptions = new WeakMap<(state: SelectionState<TKey>) => void, (state: SelectionState<TKey>) => void>();
    let changePending = true; // initial state, then explicit mutations waiting to be published
    let mutationVersion = 0; // a provider must not commit a draft over a newer mutation

    function markChanged() {
        mutationVersion++;
        changePending = true;
    }

    // Subscribe to selection changes. The listener gets state on every change (not immediately — read getState() for the first paint). Returns an unsubscribe function.
    function subscribe(listener: (state: SelectionState<TKey>) => void): () => void {
        if (typeof listener !== "function") {
            throw new TypeError("createNotifier: 'listener' must be a function.");
        }
        if (destroyed) return function unsubscribe() {};

        let wrapped = subscriptions.get(listener);
        if (!wrapped) {
            wrapped = function (state) {
                listener({
                    ...state,
                    selected: [...state.selected],
                    marquee: state.marquee ? {...state.marquee} : null
                });
            };
            subscriptions.set(listener, wrapped);
        }

        return notifier.subscribe(wrapped);
    }

    // Capture release and error callbacks can reenter before an outer mutation is published.
    // Consume that pending change once; the shared notifier owns delivery and reentrancy.
    function notify() {
        if (destroyed || !initialized || !changePending) return;

        changePending = false;
        notifier.notify();
    }

    function getState(): SelectionState<TKey> {
        return {
            selected: sortedSelection(),
            selectedCount: selected.size,
            anchor: anchor,
            focused: focused,
            mode: currentMode,
            count: itemCount,
            marqueeing: marqueeing,
            marquee: marqueeRect ? {...marqueeRect} : null
        };
    }

    function collectItemElements() {
        if (!container || !itemSelector) return [];

        return [...container!.querySelectorAll(itemSelector)].filter(function (element) {
            return typeof element.getBoundingClientRect === "function";
        });
    }

    function calculateResolvedColumnCount() {
        if (itemSelector) {
            const itemElements = collectItemElements();
            if (itemElements.length === 0) return 1;

            const firstTop = itemElements[0].getBoundingClientRect().top;
            let columnCount = 0;

            for (const itemElement of itemElements) {
                const top = itemElement.getBoundingClientRect().top;
                if (Math.abs(top - firstTop) > 1) break;
                columnCount += 1;
            }

            return Math.max(1, columnCount);
        }

        const columnCount = calculateColumnCount();
        if (!Number.isInteger(columnCount) || columnCount < 1) {
            throw new TypeError("createSelection: the 'calculateColumnCount' callback must return a positive integer.");
        }

        return columnCount;
    }

    function collectResolvedIndicesInRect(rect: SelectionRect) {
        if (collectIndicesInRect) return collectIndicesInRect(rect);
        if (!container || !itemSelector) return [];

        const containerRect = container!.getBoundingClientRect();
        const indices: number[] = [];

        collectItemElements().forEach(function (element, index) {
            const cellRect = element.getBoundingClientRect();
            const cellBox = {
                x: cellRect.left - containerRect.left - container!.clientLeft + container!.scrollLeft,
                y: cellRect.top - containerRect.top - container!.clientTop + container!.scrollTop,
                width: cellRect.width,
                height: cellRect.height
            };

            const intersects = (
                rect.x < cellBox.x + cellBox.width &&
                rect.x + rect.width > cellBox.x &&
                rect.y < cellBox.y + cellBox.height &&
                rect.y + rect.height > cellBox.y
            );

            if (intersects) {
                indices.push(index);
            }
        });

        return indices;
    }

    // endregion

    // region ===== Selection State ====================================================================================
    const selected = new Set<TKey>(); // selected item ids (we store keys, not indices, so selection survives reorders)
    let anchor: number | null = null; // the index a Shift-range extends from
    let focused: number | null = null; // the active index (keyboard, DOM focus, or last click)
    const currentMode = mode;
    const itemCount = count;

    function isValidIndex(index: unknown) {
        return typeof index === "number" && Number.isInteger(index) && index >= 0 && index < itemCount;
    }

    // Checks a key from state.selected; resolve indices with the configured getItemKey.
    function isSelected(key: TKey): boolean {
        return selected.has(key);
    }

    function sortedSelection() {
        return [...selected].sort(function (a, b) {
            if (typeof a === "number" && typeof b === "number") return a - b;

            return String(a).localeCompare(String(b));
        });
    }

    function hasSameSelection(nextSelected: Set<TKey>) {
        if (selected.size !== nextSelected.size) return false;

        for (const id of nextSelected) {
            if (!selected.has(id)) return false;
        }
        return true;
    }

    // Resolve providers against a draft so a failure cannot leave a partial update.
    function applySelectionUpdate(operation: string, update: (draft: {selected: Set<TKey>; anchor: number | null; focused: number | null; marquee: SelectionRect | null}) => boolean | void) {
        if (destroyed) return false;

        const snapshot = marqueeSnapshot!;
        const version = mutationVersion;
        const next = {
            selected: new Set(selected),
            anchor: anchor,
            focused: focused,
            marquee: marqueeRect ? {...marqueeRect} : null
        };

        try {
            if (update(next) === false) return false;
        } catch (error) {
            handleSelectionError(operation, error, snapshot);
            return false;
        }

        if (destroyed || mutationVersion !== version) return false;
        if (operation === "marquee" && (!marqueeing || marqueeSnapshot !== snapshot)) return false;

        const membershipChanged = !hasSameSelection(next.selected);
        const rectChanged = marqueeRect === null || next.marquee === null
            ? marqueeRect !== next.marquee
            : marqueeRect.x !== next.marquee.x || marqueeRect.y !== next.marquee.y || marqueeRect.width !== next.marquee.width || marqueeRect.height !== next.marquee.height;

        if (membershipChanged || anchor !== next.anchor || focused !== next.focused || rectChanged) {
            if (membershipChanged) {
                selected.clear();
                next.selected.forEach(function (id) {selected.add(id);});
            }
            anchor = next.anchor;
            focused = next.focused;
            marqueeRect = next.marquee;
            marqueeMoved = marqueeRect !== null;
            markChanged();
        }
        notify();
        return !destroyed;
    }

    function replaceWith(nextSelected: Set<TKey>, indices: number[]) {
        nextSelected.clear();
        for (const index of indices) {
            if (destroyed) return;
            nextSelected.add(getItemKey(index));
        }
    }

    function addRange(nextSelected: Set<TKey>, fromIndex: number, toIndex: number) {
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        for (let index = start; index <= end; index++) {
            if (destroyed) return;
            nextSelected.add(getItemKey(index));
        }
    }

    // The click resolver: plain replaces, meta toggles, Shift extends a range from the anchor.
    // Consumers normalize clicks with {meta: event.metaKey || event.ctrlKey, shift: event.shiftKey}.
    function select(index: number, modifiers?: {shift?: boolean; meta?: boolean}): void {
        if (destroyed || !isValidIndex(index)) return;

        modifiers = modifiers || {};

        if (currentMode === "multi" && modifiers.meta && (!modifiers.shift || anchor === null)) {
            toggle(index);
            return;
        }

        applySelectionUpdate("select", function (next) {
            next.focused = index;

            if (currentMode === "multi" && modifiers.shift && next.anchor !== null) {
                if (!modifiers.meta) next.selected.clear();
                addRange(next.selected, next.anchor, index);
                return;
            }

            replaceWith(next.selected, [index]);
            next.anchor = index;
        });
    }

    function toggle(index: number): void {
        if (destroyed || !isValidIndex(index)) return;

        applySelectionUpdate("toggle", function (next) {
            const id = getItemKey(index);
            if (next.selected.has(id)) {
                next.selected.delete(id);
            } else {
                if (currentMode === "single") next.selected.clear();
                next.selected.add(id);
            }

            next.anchor = index;
            next.focused = index;
        });
    }

    function deselect(index: number): void {
        if (destroyed || !isValidIndex(index)) return;

        applySelectionUpdate("deselect", function (next) {
            next.selected.delete(getItemKey(index));
        });
    }

    // Adds the specified range to the existing selection.
    function selectRange(fromIndex: number, toIndex: number): void {
        if (destroyed || currentMode === "single" || !isValidIndex(fromIndex) || !isValidIndex(toIndex)) return;

        applySelectionUpdate("select-range", function (next) {
            addRange(next.selected, fromIndex, toIndex);
            next.anchor = fromIndex;
            next.focused = toIndex;
        });
    }

    function selectAll(): void {
        if (destroyed || currentMode === "single") return;

        applySelectionUpdate("select-all", function (next) {
            if (itemCount > 0) addRange(next.selected, 0, itemCount - 1);
        });
    }

    function clear(): void {
        if (destroyed || (selected.size === 0 && anchor === null)) return;

        selected.clear();
        anchor = null;
        markChanged();
        notify();
    }

    // endregion

    // region ===== Keyboard ===========================================================================================
    // Synchronize logical focus without selecting an item or requesting DOM focus.
    function setFocused(index: number | null): void {
        if (destroyed || (index !== null && !isValidIndex(index)) || focused === index) return;

        focused = index;
        markChanged();
        notify();
    }

    function handleFocusIn(event: {target?: EventTarget | null}) {
        if (destroyed || !itemSelector) return;

        const target = event.target as HTMLElement | null;
        if (!target || typeof target.closest !== "function") return;

        try {
            const item = target.closest(itemSelector);
            if (!item || item === container) return;

            setFocused(collectItemElements().indexOf(item));
        } catch (error) {
            handleSelectionError("focus", error);
        }
    }

    function handleKeydown(event: KeyboardEvent) {
        if (destroyed || !keyboard) return;

        try {
            if (shouldIgnoreKeyboard(event)) return;
        } catch (error) {
            handleSelectionError("keyboard", error);
            return;
        }

        const key = event.key;

        // Cancel an active marquee, or clear the selection when no gesture is running.
        if (key === "Escape") {
            if (marqueeing) {
                event.preventDefault();
                resetMarquee(true);
                notify();
            } else {
                clear();
            }
            return;
        }

        // The consumer decides whether Enter opens, previews, or confirms anything.
        if (key === "Enter") {
            if (onEnter) {
                event.preventDefault();
                callConsumer(onEnter, {state: getState(), event: event});
            }
            return;
        }

        if (itemCount === 0) return;

        // Select all
        if ((event.metaKey || event.ctrlKey) && (key === "a" || key === "A")) {
            event.preventDefault();
            selectAll();
            return;
        }

        // Toggle the focused item
        if (key === " " && focused !== null) {
            event.preventDefault();
            toggle(focused);
            return;
        }

        // Arrow navigation (grid-aware — Up/Down move by a row, Left/Right by one)
        if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(key)) return;

        event.preventDefault();
        const updated = applySelectionUpdate("keyboard", function (next) {
            const columnCount = calculateResolvedColumnCount();
            const delta = arrowDelta(key, columnCount);
            let nextIndex = next.focused === null ? (delta > 0 ? 0 : itemCount - 1) : Math.max(0, Math.min(itemCount - 1, next.focused + delta));

            if (next.focused !== null && (key === "ArrowUp" || key === "ArrowDown")) {
                const nextRow = Math.floor(next.focused / columnCount) + (key === "ArrowUp" ? -1 : 1);
                if (nextRow < 0 || nextRow * columnCount >= itemCount) nextIndex = next.focused;
            }

            const previousFocused = next.focused;
            next.focused = nextIndex;

            // Shift extends the selection from the anchor; otherwise move to the new item.
            if (event.shiftKey && currentMode === "multi") {
                if (next.anchor === null) next.anchor = previousFocused ?? nextIndex;
                next.selected.clear();
                addRange(next.selected, next.anchor, nextIndex);
            } else {
                replaceWith(next.selected, [nextIndex]);
                next.anchor = nextIndex;
            }
        });

        if (updated && focused !== null && onFocusRequest) {
            callConsumer(onFocusRequest, {index: focused, event: event});
        }
    }

    // Nested controls own their keys; the container and configured item roots remain eligible.
    function shouldIgnoreKeyboard(event: KeyboardEvent) {
        if (event.defaultPrevented) return true;

        const target = event.target as HTMLElement | null;
        if (!target || typeof target.closest !== "function") return false;
        if (target.isContentEditable) return true;

        const control = target.closest(interactiveControlSelector);

        if (!control || control === container || !container!.contains(control)) return false;

        const item = itemSelector ? target.closest(itemSelector) : null;

        // Editable item roots still need their native keyboard behavior.
        return control !== item || control.matches("input, textarea, select, option, [role='textbox'], [role='searchbox'], [role='combobox']");
    }

    // endregion

    // region ===== Marquee ============================================================================================
    let marqueeing = false; // a marquee gesture is in progress
    let marqueeMoved = false; // has it dragged past the threshold (vs a bare click)?
    let marqueeRect: SelectionRect | null = null; // {x, y, width, height} in CONTENT space (scroll included), or null
    let marqueePointerId: number | null = null;
    let marqueeStartX = 0;
    let marqueeStartY = 0;
    let marqueeBase: Set<TKey> | null = null; // ids selected before an additive drag; null means no starting modifier
    let marqueeSnapshot: {selected: Set<TKey>; anchor: number | null; version: number; pending: boolean} | null = null; // selection, anchor, and pending changes before the gesture

    // Pointer position in the container's CONTENT space, so off-screen items are covered by the box.
    function calculateContentPoint(event: {clientX: number; clientY: number}) {
        const rect = container!.getBoundingClientRect();

        return {
            x: event.clientX - rect.left - container!.clientLeft + container!.scrollLeft,
            y: event.clientY - rect.top - container!.clientTop + container!.scrollTop
        };
    }

    function handleMarqueeDown(event: PointerEvent) {
        if (destroyed || !marquee || currentMode === "single" || event.button !== 0) return;
        if (marqueeing || event.defaultPrevented) return;

        let snapshot = marqueeSnapshot;
        try {
            const target = event.target as HTMLElement | null;
            if (!target || typeof target.closest !== "function") return;
            if (!itemSelector && target !== container) return;

            const item = itemSelector ? target.closest(itemSelector) : null;
            if (item && item !== container && container!.contains(item)) return;

            if (target.isContentEditable) return;

            const control = target.closest(interactiveControlSelector);
            if (control && control !== container && container!.contains(control)) return;

            const start = calculateContentPoint(event);
            if (destroyed) return;

            snapshot = marqueeSnapshot = {
                selected: new Set(selected),
                anchor: anchor,
                version: mutationVersion,
                pending: changePending
            };
            marqueeing = true;
            marqueeMoved = false;
            marqueePointerId = event.pointerId;
            marqueeStartX = start.x;
            marqueeStartY = start.y;
            marqueeBase = event.metaKey || event.ctrlKey || event.shiftKey
                ? new Set(selected)
                : null;
            markChanged();
            container!.setPointerCapture(event.pointerId);
            notify();
        } catch (error) {
            handleSelectionError("marquee", error, snapshot);
        }
    }

    function handleMarqueeMove(event: PointerEvent) {
        if (destroyed || !marqueeing || event.pointerId !== marqueePointerId) return;

        const snapshot = marqueeSnapshot!;
        applySelectionUpdate("marquee", function (next) {
            const point = calculateContentPoint(event);

            // Below the threshold it's still a click, not a marquee.
            if (!marqueeMoved && Math.abs(point.x - marqueeStartX) < 4 && Math.abs(point.y - marqueeStartY) < 4) return false;

            next.marquee = {x: Math.min(marqueeStartX, point.x), y: Math.min(marqueeStartY, point.y), width: Math.abs(point.x - marqueeStartX), height: Math.abs(point.y - marqueeStartY)};
            const indices = collectResolvedIndicesInRect({...next.marquee});
            if (destroyed || !marqueeing || marqueeSnapshot !== snapshot) return false;

            next.selected = new Set(marqueeBase);
            for (const index of indices) {
                if (destroyed || !marqueeing || marqueeSnapshot !== snapshot) return false;
                next.selected.add(getItemKey(index));
            }
        });
    }

    function handleMarqueeUp(event: PointerEvent) {
        if (destroyed || !marqueeing || event.pointerId !== marqueePointerId) return;

        // A bare click on empty space (no drag, no modifier) clears the selection — Finder behavior.
        if (!marqueeMoved && marqueeBase === null) {
            selected.clear();
            anchor = null;
        }

        resetMarquee(false);
        notify();
    }

    function handleMarqueeCancel(event: PointerEvent) {
        if (destroyed || !marqueeing || event.pointerId !== marqueePointerId) return;
        if (event.type === "lostpointercapture" && event.target !== container) return;

        resetMarquee(true);
        notify();
    }

    function resetMarquee(restoreSelection: boolean) {
        if (!marqueeing) return;

        const pointerId = marqueePointerId!;
        const snapshot = marqueeSnapshot!;
        const unpublished = changePending && mutationVersion === snapshot.version + 1 &&
            (restoreSelection || (anchor === snapshot.anchor && hasSameSelection(snapshot.selected)));
        // Preserve focus changes made through navigation or native DOM focus during the gesture.
        if (restoreSelection) {
            selected.clear();
            snapshot.selected.forEach(function (id: TKey) {selected.add(id);});
            anchor = snapshot.anchor;
        }

        // Clear the gesture before releasing capture, which can emit lostpointercapture.
        marqueeing = false;
        marqueeMoved = false;
        marqueeRect = null;
        marqueePointerId = null;
        marqueeStartX = 0;
        marqueeStartY = 0;
        marqueeBase = null;
        marqueeSnapshot = null;
        markChanged();
        // Capture callbacks can cancel a start before it was delivered. Preserve that net no-op,
        // before releasing capture or reporting errors can reenter and publish newer changes.
        if (unpublished) changePending = snapshot.pending;
        const version = mutationVersion;

        try {
            if (container!.hasPointerCapture(pointerId)) container!.releasePointerCapture(pointerId);
        } catch (error) {
            if (!restoreSelection && mutationVersion === version && (anchor !== snapshot.anchor || !hasSameSelection(snapshot.selected))) {
                selected.clear();
                snapshot.selected.forEach(function (id: TKey) {selected.add(id);});
                anchor = snapshot.anchor;
                markChanged();
            }
            handleSelectionError("pointer-capture", error);
        }
    }

    // endregion

    // region ===== Tear Down ==========================================================================================
    function destroy(): void {
        if (destroyed) return;

        destroyed = true; // make future work and future destroy calls harmless

        resetMarquee(true);

        cleanups.forEach(function (cleanup) {
            cleanup();
        });

        cleanups.length = 0; // release references to the cleanup functions and their event targets
        notifier.destroy();
    }

    // endregion

    init();

    return {
        getState,
        subscribe,
        setFocused,
        select,
        toggle,
        deselect,
        selectRange,
        selectAll,
        clear,
        isSelected,
        destroy
    };
}
