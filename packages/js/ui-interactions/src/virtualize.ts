import {callConsumer, createErrorReporter} from 'strata-packages/ui-interactions/internal/core';

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
    const listeners = new Set<(state: VirtualizerState) => void>(); // change subscribers — each gets the full state on every change
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

            resizeObserver.observe(gridElement);

            cleanups.push(function () {
                resizeObserver!.disconnect();
            });
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
    let lastStateSignature = ""; // last emitted state fingerprint, used to avoid duplicate echoes

    // Subscribe to changes. The listener gets state on every change (not immediately — read getState() for the first paint). Returns an unsubscribe function.
    function subscribe(listener: (state: VirtualizerState) => void): () => void {
        if (destroyed) return function unsubscribe() {};

        listeners.add(listener);

        return function unsubscribe() {
            listeners.delete(listener);
        };
    }

    // Emit the current state to every subscriber, deduped against the last snapshot so no-op changes cost nothing.
    function notify() {
        if (destroyed) return;
        const state = getState();
        const stateSignature = JSON.stringify(state);
        if (stateSignature === lastStateSignature) return;

        lastStateSignature = stateSignature;

        for (const listener of listeners) {
            callConsumer(listener, state);
        }
    }

    function getState(): VirtualizerState {
        return resolvedStrategy() === "virtual" ? buildVirtualState() : buildCssState();
    }

    // endregion

    // region ===== Geometry ===========================================================================================
    let columns = 1; // how many columns the grid resolved to (1 = a plain list)
    let cellWidth = 0; // a cell's current width, from the resolved track (responsive)
    let cellHeight = 0; // a cell's current height, derived from width × the measured aspect
    let cellAspect = 0; // a cell's height/width ratio, measured once before the rows are pinned
    let rowGap = 0; // the gap between rows
    let colGap = 0; // the gap between columns
    let scrollTop = 0; // the scroll container's current scroll position (virtual strategy)
    let scrollScheduled = false; // coalesces a burst of scroll events into one per frame
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
        notify();
    }

    function handleScroll() {
        if (destroyed || scrollScheduled) return;

        scrollScheduled = true;
        defaultView.requestAnimationFrame(function () {
            scrollScheduled = false;
            if (destroyed) return;

            scrollTop = scrollElement.scrollTop;
            notify();
        });
    }

    // endregion

    // region ===== CSS Strategy =======================================================================================
    function buildCssState(): VirtualizerState {
        const itemStyle: Record<string, string | number> = cellWidth && cellHeight ? {contentVisibility: "auto", containIntrinsicSize: roundTo(cellWidth, 2) + "px " + roundTo(cellHeight, 2) + "px"} : {contentVisibility: "auto"};

        // Pin the grid's row height so off-screen (size-contained) rows can't collapse and overlap.
        const containerStyle: Record<string, string | number> = cellAspect && cellHeight ? {gridAutoRows: roundTo(cellHeight, 2) + "px"} : {};
        const items = [];
        for (let index = 0; index < count; index++) {
            items.push({key: getItemKey(index), index: index, start: null, size: null, style: itemStyle});
        }

        return {
            strategy: "css",
            items: items,
            totalSize: null,
            containerStyle: containerStyle,
            columns: columns,
            cellWidth: roundTo(cellWidth, 2),
            cellHeight: roundTo(cellHeight, 2),
            count: count
        };
    }

    // endregion

    // region ===== Virtual Strategy ===================================================================================
    function resolvedStrategy() {
        if (strategy !== "auto") return strategy;

        return count > threshold ? "virtual" : "css";
    }

    function buildVirtualState(): VirtualizerState {
        const rowHeight = cellHeight + rowGap;
        const totalRows = Math.ceil(count / columns);
        const viewportHeight = scrollElement.clientHeight;
        const firstRow = rowHeight > 0 ? Math.floor(scrollTop / rowHeight) : 0;
        const visibleRows = rowHeight > 0 ? Math.ceil(viewportHeight / rowHeight) : 0;
        const startRow = Math.max(0, firstRow - overscan);
        const endRow = Math.min(totalRows - 1, firstRow + visibleRows + overscan);
        const startIndex = startRow * columns;
        const endIndex = Math.min(count - 1, (endRow + 1) * columns - 1);
        const items = [];
        for (let index = startIndex; index <= endIndex; index++) {
            items.push({key: getItemKey(index), index: index, start: null, size: null, style: {}});
        }

        return {
            strategy: "virtual",
            items: items,
            totalSize: roundTo(totalRows * rowHeight - rowGap, 2),
            containerStyle: {gridAutoRows: roundTo(cellHeight, 2) + "px", paddingTop: roundTo(startRow * rowHeight, 2) + "px", paddingBottom: roundTo(Math.max(0, totalRows - 1 - endRow) * rowHeight, 2) + "px"},
            columns: columns,
            cellWidth: roundTo(cellWidth, 2),
            cellHeight: roundTo(cellHeight, 2),
            count: count,
            range: {startIndex: startIndex, endIndex: endIndex}
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
        const endRow = Math.floor((rect.y + rect.height) / rowHeight);
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

        cleanups.forEach(function (cleanup) {
            cleanup();
        });

        cleanups.length = 0; // release references to the cleanup functions and their event targets
        listeners.clear();
    }

    // endregion

    init();

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
