import {createNotifier, createErrorReporter} from 'strata-packages/ui-interactions/internal/core';

export type VirtualizerStrategy = "css" | "virtual" | "auto";

export type VirtualizerItem = {
    key: string | number;
    index: number;
    start: number | null;
    size: number | null;
    style: Record<string, string | number>;
};

export type VirtualizerState = {
    strategy: "css" | "virtual";
    items: VirtualizerItem[];
    totalSize: number | null;
    containerStyle: Record<string, string | number>;
    columns: number;
    cellWidth: number;
    cellHeight: number;
    count: number;
    range?: {
        startIndex: number;
        endIndex: number;
    };
};

export type VirtualizerConfig = {
    onChange?: (state: VirtualizerState) => void;
    onError?: (error: {id: string; message: string}) => void;
    gridElement: HTMLElement;
    count?: number;
    getItemKey?: (index: number) => string | number;
    strategy?: VirtualizerStrategy;
    threshold?: number;
    scrollElement?: HTMLElement;
    overscan?: number;
};

export type VirtualizerEngine = {
    getState: () => VirtualizerState;
    subscribe: (listener: (state: VirtualizerState) => void) => () => void;
    scrollToIndex: (index: number) => void;
    scrollToOffset: (offset: number) => void;
    getItemRect: (index: number) => {top: number; left: number; width: number; height: number};
    getIndicesInRect: (rect: {x: number; y: number; width: number; height: number}) => number[];
    destroy: () => void;
};

function roundTo(value: number, places: number) {
    const factor = Math.pow(10, places);

    return Math.round(value * factor) / factor;
}

export function createVirtualizer(config: VirtualizerConfig): VirtualizerEngine {
    if (!config || typeof config !== "object") {
        throw new TypeError("createVirtualizer: 'config' must be an options object.");
    }

    // region ===== Config =============================================================================================
    const {
        onChange, onError,
        gridElement,
        count = 0,
        getItemKey = function (index) {return index;},
        strategy = "auto",
        threshold = 1500,
        scrollElement = gridElement,
        overscan = 3
    } = config;

    validateConfig();

    function validateConfig() {

        // On Change
        if (onChange !== undefined && typeof onChange !== "function") {
            throw new TypeError("createVirtualizer: the 'onChange' option must be a function when provided.");
        }

        // On Error
        if (onError !== undefined && typeof onError !== "function") {
            throw new TypeError("createVirtualizer: the 'onError' option must be a function when provided.");
        }

        // Grid Element — the element whose resolved grid geometry we read, and where items render
        if (!gridElement || typeof gridElement.getBoundingClientRect !== "function" || !("ownerDocument" in gridElement)) {
            throw new TypeError("createVirtualizer: the 'gridElement' option must be a DOM element.");
        }

        // Count
        if (!Number.isInteger(count) || count < 0) {
            throw new TypeError("createVirtualizer: the 'count' option must be a non-negative integer.");
        }

        // Get Item Key
        if (typeof getItemKey !== "function") {
            throw new TypeError("createVirtualizer: the 'getItemKey' option must be a function.");
        }

        // Strategy
        if (!["css", "virtual", "auto"].includes(strategy)) {
            throw new TypeError("createVirtualizer: the 'strategy' option must be 'css', 'virtual', or 'auto'.");
        }

        // Threshold
        if (!Number.isInteger(threshold) || threshold < 0) {
            throw new TypeError("createVirtualizer: the 'threshold' option must be a non-negative integer.");
        }

        // Scroll Element — the scroll container we read scrollTop/height from (defaults to the grid)
        if (!scrollElement || typeof scrollElement.getBoundingClientRect !== "function") {
            throw new TypeError("createVirtualizer: the 'scrollElement' option must be a DOM element.");
        }

        // Overscan
        if (!Number.isInteger(overscan) || overscan < 0) {
            throw new TypeError("createVirtualizer: the 'overscan' option must be a non-negative integer.");
        }
    }

    // endregion

    // region ===== Init ===============================================================================================
    const ownerDocument = gridElement.ownerDocument; // the grid's own document, so reads work across realms/iframes
    const defaultView = ownerDocument.defaultView!; // the window: for ResizeObserver + scroll reads later
    let destroyed = false; // late scroll/resize events must not still fire callbacks after teardown

    function init() {

        // Wire up subscribers and listeners first, so nothing that follows goes unheard
        if (onChange) subscribe(onChange);

        registerAllEventListeners();

        // Read the grid's resolved geometry before the first emit
        readGeometry();

        // Emit the initial state so the consumer can render the first window
        notify();
    }

    // endregion

    // region ===== Event Listeners ====================================================================================
    const cleanups: {(): void; (): void;}[] = []; // teardown functions, collected so everything can be undone at once

    function registerEventListener<K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, handler: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) {
        target.addEventListener(type, handler as EventListener, options);

        cleanups.push(function () {
            target.removeEventListener(type, handler as EventListener, options); // detach the exact listener that was registered
        });
    }

    function registerAllEventListeners() {

        // Grid geometry — re-derive columns + cell size when the container width changes
        if (typeof defaultView.ResizeObserver === "function") {
            resizeObserver = new defaultView.ResizeObserver(function () {
                handleResize();
            });

            cleanups.push(function () {
                resizeObserver!.disconnect();
            });

            resizeObserver.observe(gridElement);
        }

        // Scroll — the window recomputes as the user scrolls (only meaningful in the virtual strategy)
        registerEventListener(scrollElement, "scroll", function () {
            handleScroll();
        }, {passive: true});
    }

    // endregion

    // region ===== Error Handling =====================================================================================
    const reportError = createErrorReporter(onError);

    // endregion

    // region ===== State ==============================================================================================
    let lastLayout: ReturnType<typeof getLayout> | null = null;
    let lastKeys: (string | number)[] = [];
    let preparationRevision = 0;
    const notifier = createNotifier(function () {return getSnapshot(lastLayout!, lastKeys);});
    const subscriptions = new WeakMap<(state: VirtualizerState) => void, (state: VirtualizerState) => void>();

    // Subscribe to changes. The listener gets state on every change (not immediately — read getState() for the first paint). Returns an unsubscribe function.
    function subscribe(listener: (state: VirtualizerState) => void): () => void {
        if (typeof listener !== "function") {
            throw new TypeError("createNotifier: 'listener' must be a function.");
        }
        if (destroyed) return function unsubscribe() {};

        let wrapped = subscriptions.get(listener);
        if (!wrapped) {
            wrapped = function (state) {
                listener({
                    ...state,
                    items: state.items.map(function (item) {return {...item, style: {...item.style}};}),
                    containerStyle: {...state.containerStyle},
                    ...(state.range ? {range: {...state.range}} : {})
                });
            };
            subscriptions.set(listener, wrapped);
        }

        // Stable wrappers retain duplicate subscription identity while isolating owned snapshots.
        return notifier.subscribe(wrapped);
    }

    // Compare only published geometry and key identity; no-op events need no item/style snapshots.
    function notify() {
        if (destroyed) return;
        const revision = ++preparationRevision;
        const layout = getLayout();
        const keys = getKeys(layout, revision);
        if (destroyed || revision !== preparationRevision) return;
        const previous = lastLayout;
        const changed = !previous ||
            layout.columns !== previous.columns ||
            layout.cellWidth !== previous.cellWidth || layout.cellHeight !== previous.cellHeight ||
            layout.hasIntrinsicSize !== previous.hasIntrinsicSize || layout.hasAutoRows !== previous.hasAutoRows ||
            layout.startIndex !== previous.startIndex || layout.endIndex !== previous.endIndex ||
            layout.totalSize !== previous.totalSize ||
            layout.paddingTop !== previous.paddingTop || layout.paddingBottom !== previous.paddingBottom ||
            keys.length !== lastKeys.length || keys.some(function (key, index) {return !Object.is(key, lastKeys[index]);});
        if (!changed) return;

        lastLayout = layout;
        lastKeys = keys;
        notifier.notify();
    }

    function getState(): VirtualizerState {
        const layout = getLayout();
        return getSnapshot(layout, getKeys(layout));
    }

    function getKeys(layout: ReturnType<typeof getLayout>, revision?: number) {
        const keys = [];
        for (let index = layout.startIndex; index <= layout.endIndex; index++) {
            if (revision !== undefined && (destroyed || revision !== preparationRevision)) break;
            keys.push(getItemKey(index));
        }
        return keys;
    }

    function getSnapshot(layout: ReturnType<typeof getLayout>, keys: (string | number)[]): VirtualizerState {
        return layout.strategy === "virtual" ? buildVirtualState(layout, keys) : buildCssState(layout, keys);
    }

    // endregion

    // region ===== Geometry ===========================================================================================
    let columns = 1; // how many columns the grid resolved to (1 = a plain list)
    let cellWidth = 0; // a cell's current width, from the resolved track (responsive)
    let cellHeight = 0; // a cell's current height, derived from width × the measured aspect
    let cellAspect = 0; // a cell's height/width ratio, measured once before the rows are pinned
    let rowGap = 0; // the gap between rows
    let colGap = 0; // the gap between columns
    let scrollTop = scrollElement.scrollTop; // include an already-scrolled container in the initial window
    let scrollFrame: number | null = null; // coalesces scroll events and owns the pending frame for teardown
    let resizeObserver: ResizeObserver | null = null; // re-reads geometry when the container width changes

    // Read the browser's RESOLVED grid: columns + track width from computed style; cell aspect measured once.
    function readGeometry() {
        const computed = defaultView.getComputedStyle(gridElement);
        const tracks = computed.gridTemplateColumns.split(" ").filter(function (token) {return token.indexOf("px") !== -1;});
        columns = Math.max(1, tracks.length);
        rowGap = parseFloat(computed.rowGap) || 0;
        colGap = parseFloat(computed.columnGap) || 0;

        const firstCell = gridElement.firstElementChild;

        // Track width is reliable even under size containment; fall back to measuring for a non-grid list.
        cellWidth = parseFloat(tracks[0]) || (firstCell ? firstCell.getBoundingClientRect().width : 0);

        // Measure the cell's aspect ratio ONCE, before we pin the rows, then derive height from the width.
        if (!cellAspect && firstCell) {
            const rect = firstCell.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) cellAspect = rect.height / rect.width;
        }

        cellHeight = cellAspect ? cellWidth * cellAspect : cellWidth;
    }

    function handleResize() {
        if (destroyed) return;

        readGeometry();
        scrollTop = scrollElement.scrollTop;
        notify();
    }

    function handleScroll() {
        if (destroyed || scrollFrame !== null) return;

        scrollFrame = defaultView.requestAnimationFrame(function () {
            scrollFrame = null;
            if (destroyed) return;

            scrollTop = scrollElement.scrollTop;
            notify();
        });
    }

    // endregion

    // region ===== CSS Strategy =======================================================================================
    function buildCssState(layout: ReturnType<typeof getLayout>, keys: (string | number)[]): VirtualizerState {
        const itemStyle: Record<string, string | number> = layout.hasIntrinsicSize ? {contentVisibility: "auto", containIntrinsicSize: layout.cellWidth + "px " + layout.cellHeight + "px"} : {contentVisibility: "auto"};

        // Pin the grid's row height so off-screen (size-contained) rows can't collapse and overlap.
        const containerStyle: Record<string, string | number> = layout.hasAutoRows ? {gridAutoRows: layout.cellHeight + "px"} : {};
        const items = keys.map(function (key, index) {return {key: key, index: index, start: null, size: null, style: {...itemStyle}};});

        return {
            strategy: "css",
            items: items,
            totalSize: null,
            containerStyle: containerStyle,
            columns: layout.columns,
            cellWidth: layout.cellWidth,
            cellHeight: layout.cellHeight,
            count: count
        };
    }

    // endregion

    // region ===== Virtual Strategy ===================================================================================
    function resolvedStrategy() {
        if (strategy !== "auto") return strategy;

        return count > threshold ? "virtual" : "css";
    }

    function getLayout() {
        const currentStrategy = resolvedStrategy();
        const rowHeight = cellHeight + rowGap;
        const totalRows = Math.ceil(count / columns);
        const viewportHeight = scrollElement.clientHeight;
        const firstRow = rowHeight > 0 ? Math.max(0, Math.min(totalRows - 1, Math.floor(scrollTop / rowHeight))) : 0;
        const visibleRows = rowHeight > 0 ? Math.ceil(viewportHeight / rowHeight) : 0;
        const startRow = Math.max(0, firstRow - overscan);
        const endRow = Math.min(totalRows - 1, firstRow + visibleRows + overscan);
        return {
            strategy: currentStrategy,
            columns: columns,
            cellWidth: roundTo(cellWidth, 2),
            cellHeight: roundTo(cellHeight, 2),
            hasIntrinsicSize: currentStrategy === "css" && count > 0 && !!(cellWidth && cellHeight),
            hasAutoRows: currentStrategy === "virtual" || !!(cellAspect && cellHeight),
            startIndex: currentStrategy === "virtual" ? startRow * columns : 0,
            endIndex: currentStrategy === "virtual" ? Math.min(count - 1, (endRow + 1) * columns - 1) : count - 1,
            totalSize: currentStrategy === "virtual" ? roundTo(totalRows ? totalRows * rowHeight - rowGap : 0, 2) : null,
            paddingTop: currentStrategy === "virtual" ? roundTo(startRow * rowHeight, 2) : 0,
            paddingBottom: currentStrategy === "virtual" ? roundTo(Math.max(0, totalRows - 1 - endRow) * rowHeight, 2) : 0
        };
    }

    function buildVirtualState(layout: ReturnType<typeof getLayout>, keys: (string | number)[]): VirtualizerState {
        const items = keys.map(function (key, index) {return {key: key, index: layout.startIndex + index, start: null, size: null, style: {}};});

        return {
            strategy: "virtual",
            items: items,
            totalSize: layout.totalSize,
            containerStyle: {gridAutoRows: layout.cellHeight + "px", paddingTop: layout.paddingTop + "px", paddingBottom: layout.paddingBottom + "px"},
            columns: layout.columns,
            cellWidth: layout.cellWidth,
            cellHeight: layout.cellHeight,
            count: count,
            range: {startIndex: layout.startIndex, endIndex: layout.endIndex}
        };
    }

    // endregion

    // region ===== Scroll Controls ====================================================================================
    function scrollToOffset(offset: number): void {
        if (destroyed) return;
        if (typeof offset !== "number" || !Number.isFinite(offset)) {
            throw new TypeError("scrollToOffset: 'offset' must be a finite number.");
        }

        scrollElement.scrollTop = Math.max(0, offset); // the browser clamps the upper bound
    }

    function scrollToIndex(index: number): void {
        if (destroyed) return;
        if (!Number.isInteger(index) || index < 0) {
            throw new TypeError("scrollToIndex: 'index' must be a non-negative integer.");
        }

        const rowHeight = cellHeight + rowGap;
        scrollToOffset(Math.floor(index / columns) * rowHeight);
    }

    // endregion

    // region ===== Positioning ========================================================================================
    function getItemRect(index: number): {top: number; left: number; width: number; height: number} {
        const rowHeight = cellHeight + rowGap;
        const colWidth = cellWidth + colGap;

        return {top: Math.floor(index / columns) * rowHeight, left: (index % columns) * colWidth, width: cellWidth, height: cellHeight};
    }

    function getIndicesInRect(rect: {x: number; y: number; width: number; height: number}): number[] {
        const rowHeight = cellHeight + rowGap;
        const colWidth = cellWidth + colGap;
        if (rowHeight <= 0 || colWidth <= 0) return [];

        const startRow = Math.max(0, Math.floor(rect.y / rowHeight));
        const endRow = Math.min(Math.ceil(count / columns) - 1, Math.floor((rect.y + rect.height) / rowHeight));
        const startCol = Math.max(0, Math.floor(rect.x / colWidth));
        const endCol = Math.min(columns - 1, Math.floor((rect.x + rect.width) / colWidth));
        const indices = [];
        for (let row = startRow; row <= endRow; row++) {
            for (let col = startCol; col <= endCol; col++) {
                const index = row * columns + col;
                if (index < count) indices.push(index);
            }
        }

        return indices;
    }

    // endregion

    // region ===== Tear Down ==========================================================================================
    function destroy(): void {
        if (destroyed) return;

        destroyed = true; // make future work and future destroy calls harmless
        notifier.destroy();
        if (scrollFrame !== null) defaultView.cancelAnimationFrame(scrollFrame);
        scrollFrame = null;

        cleanups.forEach(function (cleanup) {
            cleanup();
        });

        cleanups.length = 0; // release references to the cleanup functions and their event targets
    }

    // endregion

    try {
        init();
    } catch (error) {
        destroy();
        throw error;
    }

    return {
        getState,
        subscribe,
        scrollToIndex,
        scrollToOffset,
        getItemRect,
        getIndicesInRect,
        destroy
    };
}
