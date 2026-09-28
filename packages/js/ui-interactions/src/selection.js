import {callConsumer, createErrorReporter} from './internal/core.js';

const interactiveControlSelector =
    "button, a[href], input, textarea, select, option, label, summary, audio[controls], video[controls], " +
    "[role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='switch'], [role='textbox'], [role='searchbox'], " +
    "[role='combobox'], [role='listbox'], [role='slider'], [role='spinbutton'], [role='tab'], " +
    "[role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], [contenteditable]:not([contenteditable='false'])";

function arrowDelta(key, columns) {
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

export function createSelection(config = {}) {
    if (!config || typeof config !== "object") {
        throw new TypeError("createSelection: 'config' must be an options object.");
    }

    // region ===== Config =============================================================================================
    const {
        onChange, onError, onEnter, onFocusRequest,
        count = 0,
        getItemKey = function (index) { return index; },
        mode = "multi",
        container = null,
        keyboard = true,
        calculateColumnCount = function () { return 1; },
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
        if (container !== null && typeof container.addEventListener !== "function") {
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

    function init() {

        // Wire up subscribers and listeners first, so nothing that follows goes unheard
        if (onChange) subscribe(onChange);

        registerAllEventListeners();

        // Respect focus that was already inside an item before the engine was created.
        handleFocusIn({target: container?.ownerDocument?.activeElement});

        // Emit the initial (empty) selection
        notify();
    }

    // endregion

    // region ===== Event Listeners ====================================================================================
    const listeners = new Set(); // change subscribers — each gets the full state on every change
    const cleanups = []; // teardown functions, collected so everything can be undone at once

    function registerEventListener(target, type, handler, options) {
        target.addEventListener(type, handler, options);

        cleanups.push(function () {
            target.removeEventListener(type, handler, options); // detach the exact listener that was registered
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

    function handleSelectionError(operation, cause, snapshot = marqueeSnapshot) {
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
    let lastStateSignature = ""; // last emitted state fingerprint, used to avoid duplicate echoes
    let notificationVersion = 0; // newer notifications supersede an in-progress delivery

    // Subscribe to selection changes. The listener gets state on every change (not immediately — read getState() for the first paint). Returns an unsubscribe function.
    function subscribe(listener) {
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
        const version = ++notificationVersion;

        for (const listener of listeners) {
            if (destroyed || version !== notificationVersion) return;

            callConsumer(listener, {
                ...state,
                selected: [...state.selected],
                marquee: state.marquee ? {...state.marquee} : null
            });
        }
    }

    function getState() {
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

        return [...container.querySelectorAll(itemSelector)].filter(function (element) {
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

    function collectResolvedIndicesInRect(rect) {
        if (collectIndicesInRect) return collectIndicesInRect(rect);
        if (!container || !itemSelector) return [];

        const containerRect = container.getBoundingClientRect();
        const indices = [];

        collectItemElements().forEach(function (element, index) {
            const cellRect = element.getBoundingClientRect();
            const cellBox = {
                x: cellRect.left - containerRect.left - container.clientLeft + container.scrollLeft,
                y: cellRect.top - containerRect.top - container.clientTop + container.scrollTop,
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
    const selected = new Set(); // selected item ids (we store keys, not indices, so selection survives reorders)
    let anchor = null; // the index a Shift-range extends from
    let focused = null; // the active index (keyboard, DOM focus, or last click)
    const currentMode = mode;
    const itemCount = count;

    function isValidIndex(index) {
        return Number.isInteger(index) && index >= 0 && index < itemCount;
    }

    // Checks a key from state.selected; resolve indices with the configured getItemKey.
    function isSelected(key) {
        return selected.has(key);
    }

    function sortedSelection() {
        return [...selected].sort(function (a, b) {
            if (typeof a === "number" && typeof b === "number") return a - b;

            return String(a).localeCompare(String(b));
        });
    }

    // Resolve providers against a draft so a failure cannot leave a partial update.
    function applySelectionUpdate(operation, update) {
        if (destroyed) return false;

        const snapshot = marqueeSnapshot;
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

        if (destroyed) return false;
        if (operation === "marquee" && (!marqueeing || marqueeSnapshot !== snapshot)) return false;

        selected.clear();
        next.selected.forEach(function (id) { selected.add(id); });
        anchor = next.anchor;
        focused = next.focused;
        marqueeRect = next.marquee;
        marqueeMoved = marqueeRect !== null;
        notify();
        return !destroyed;
    }

    function replaceWith(nextSelected, indices) {
        nextSelected.clear();
        for (const index of indices) {
            if (destroyed) return;
            nextSelected.add(getItemKey(index));
        }
    }

    function addRange(nextSelected, fromIndex, toIndex) {
        const start = Math.min(fromIndex, toIndex);
        const end = Math.max(fromIndex, toIndex);
        for (let index = start; index <= end; index++) {
            if (destroyed) return;
            nextSelected.add(getItemKey(index));
        }
    }

    // The click resolver: plain replaces, meta toggles, Shift extends a range from the anchor.
    // Consumers normalize clicks with {meta: event.metaKey || event.ctrlKey, shift: event.shiftKey}.
    function select(index, modifiers) {
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

    function toggle(index) {
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

    function deselect(index) {
        if (destroyed || !isValidIndex(index)) return;

        applySelectionUpdate("deselect", function (next) {
            next.selected.delete(getItemKey(index));
        });
    }

    // Adds the specified range to the existing selection.
    function selectRange(fromIndex, toIndex) {
        if (destroyed || currentMode === "single" || !isValidIndex(fromIndex) || !isValidIndex(toIndex)) return;

        applySelectionUpdate("select-range", function (next) {
            addRange(next.selected, fromIndex, toIndex);
            next.anchor = fromIndex;
            next.focused = toIndex;
        });
    }

    function selectAll() {
        if (destroyed || currentMode === "single") return;

        applySelectionUpdate("select-all", function (next) {
            if (itemCount > 0) addRange(next.selected, 0, itemCount - 1);
        });
    }

    function clear() {
        if (destroyed) return;

        selected.clear();
        anchor = null;
        notify();
    }

    // endregion

    // region ===== Keyboard ===========================================================================================
    // Synchronize logical focus without selecting an item or requesting DOM focus.
    function setFocused(index) {
        if (destroyed || (index !== null && !isValidIndex(index)) || focused === index) return;

        focused = index;
        notify();
    }

    function handleFocusIn(event) {
        if (destroyed || !itemSelector) return;

        const target = event.target;
        if (!target || typeof target.closest !== "function") return;

        try {
            const item = target.closest(itemSelector);
            if (!item || item === container) return;

            setFocused(collectItemElements().indexOf(item));
        } catch (error) {
            handleSelectionError("focus", error);
        }
    }

    function handleKeydown(event) {
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
    function shouldIgnoreKeyboard(event) {
        if (event.defaultPrevented) return true;

        const target = event.target;
        if (!target || typeof target.closest !== "function") return false;
        if (target.isContentEditable) return true;

        const control = target.closest(interactiveControlSelector);

        if (!control || control === container || !container.contains(control)) return false;

        const item = itemSelector ? target.closest(itemSelector) : null;

        // Editable item roots still need their native keyboard behavior.
        return control !== item || control.matches("input, textarea, select, option, [role='textbox'], [role='searchbox'], [role='combobox']");
    }

    // endregion

    // region ===== Marquee ============================================================================================
    let marqueeing = false; // a marquee gesture is in progress
    let marqueeMoved = false; // has it dragged past the threshold (vs a bare click)?
    let marqueeRect = null; // {x, y, width, height} in CONTENT space (scroll included), or null
    let marqueePointerId = null;
    let marqueeStartX = 0;
    let marqueeStartY = 0;
    let marqueeBase = null; // ids selected before an additive drag; null means no starting modifier
    let marqueeSnapshot = null; // selection and anchor to restore if the gesture is canceled

    // Pointer position in the container's CONTENT space, so off-screen items are covered by the box.
    function calculateContentPoint(event) {
        const rect = container.getBoundingClientRect();

        return {
            x: event.clientX - rect.left - container.clientLeft + container.scrollLeft,
            y: event.clientY - rect.top - container.clientTop + container.scrollTop
        };
    }

    function handleMarqueeDown(event) {
        if (destroyed || !marquee || currentMode === "single" || event.button !== 0) return;
        if (marqueeing || event.defaultPrevented) return;

        try {
            const target = event.target;
            if (!target || typeof target.closest !== "function") return;
            if (!itemSelector && target !== container) return;

            const item = itemSelector ? target.closest(itemSelector) : null;
            if (item && item !== container && container.contains(item)) return;

            if (target.isContentEditable) return;

            const control = target.closest(interactiveControlSelector);
            if (control && control !== container && container.contains(control)) return;

            const start = calculateContentPoint(event);
            if (destroyed) return;

            marqueeSnapshot = {
                selected: new Set(selected),
                anchor: anchor
            };
            marqueeing = true;
            marqueeMoved = false;
            marqueePointerId = event.pointerId;
            marqueeStartX = start.x;
            marqueeStartY = start.y;
            marqueeBase = event.metaKey || event.ctrlKey || event.shiftKey
                ? new Set(selected)
                : null;
            container.setPointerCapture(event.pointerId);
            notify();
        } catch (error) {
            handleSelectionError("marquee", error);
        }
    }

    function handleMarqueeMove(event) {
        if (destroyed || !marqueeing || event.pointerId !== marqueePointerId) return;

        const snapshot = marqueeSnapshot;
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

    function handleMarqueeUp(event) {
        if (destroyed || !marqueeing || event.pointerId !== marqueePointerId) return;

        // A bare click on empty space (no drag, no modifier) clears the selection — Finder behavior.
        if (!marqueeMoved && marqueeBase === null) {
            selected.clear();
            anchor = null;
        }

        resetMarquee(false);
        notify();
    }

    function handleMarqueeCancel(event) {
        if (destroyed || !marqueeing || event.pointerId !== marqueePointerId) return;
        if (event.type === "lostpointercapture" && event.target !== container) return;

        resetMarquee(true);
        notify();
    }

    function resetMarquee(restoreSelection) {
        if (!marqueeing) return;

        const pointerId = marqueePointerId;
        const snapshot = marqueeSnapshot;
        // Preserve focus changes made through navigation or native DOM focus during the gesture.
        if (restoreSelection) {
            selected.clear();
            snapshot.selected.forEach(function (id) { selected.add(id); });
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

        try {
            if (container.hasPointerCapture(pointerId)) container.releasePointerCapture(pointerId);
        } catch (error) {
            if (!restoreSelection) {
                selected.clear();
                snapshot.selected.forEach(function (id) { selected.add(id); });
                anchor = snapshot.anchor;
            }
            handleSelectionError("pointer-capture", error);
        }
    }

    // endregion

    // region ===== Tear Down ==========================================================================================
    function destroy() {
        if (destroyed) return;

        destroyed = true; // make future work and future destroy calls harmless

        resetMarquee(true);

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
