import {createErrorReporter, createNotifier} from 'strata-packages/ui-interactions/internal/core';

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
    getFileSize(file: File): {size: number; sizeFormatted: string}
    openFilePicker(): void
    createThumbnail(file: File): Promise<string | null>
    createVideoPreview(file: File): string | null
    setDisabled(value: boolean): void
    destroy(): void
}

// region ===== Generic Helpers ========================================================================================
function formatBytes(bytes: number, base = 1024) {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = bytes;
    let unit = 0;

    while (size >= base && unit < units.length - 1) {
        size = size / base;
        unit++;
    }

    return `${size.toFixed(1)} ${units[unit]}`;
}

// endregion

// region ===== File Collection ========================================================================================
async function collectDroppedFiles(dataTransferItems: DataTransferItemList): Promise<File[]> {
    const fileCollectionPromises = [];

    for (let index = 0; index < dataTransferItems.length; index++) {
        const dataTransferItem = dataTransferItems[index];

        // Convert the dropped item into a file-or-folder entry when the browser supports it
        const fileSystemEntry = dataTransferItem.webkitGetAsEntry
            ? dataTransferItem.webkitGetAsEntry() // retrieve the entry for recursive file or folder processing
            : null; // no entry API is available, so the caller must use the regular File fallback

        if (fileSystemEntry) {
            fileCollectionPromises.push(
                collectFilesFromFileSystemEntry(fileSystemEntry) // recursively collect every file contained by the entry
            );
            continue;
        }

        if (dataTransferItem.kind === "file") {
            const file = dataTransferItem.getAsFile();

            if (file) {
                fileCollectionPromises.push(
                    Promise.resolve([file]) // match the Promise-of-File-array shape returned by entry extraction
                );
            }
        }
    }

    const collectedFileGroups = await Promise.all(fileCollectionPromises);
    return collectedFileGroups.flat();
}

function collectFilesFromFileSystemEntry(fileSystemEntry: FileSystemEntry): Promise<File[]> {
    if (fileSystemEntry.isFile) {
        return new Promise(function (resolve) {
            (fileSystemEntry as FileSystemFileEntry).file(
                function (file) {
                    resolve([file]); // return the file inside an array to match the folder-extraction result shape
                },
                function () {
                    resolve([]); // treat an unreadable file as no result instead of rejecting or hanging
                }
            );
        });
    }

    const directoryReader = (fileSystemEntry as FileSystemDirectoryEntry).createReader(); // create a reader that retrieves the directory's child file-system entries in batches
    const collectedFiles: File[] = [];

    return new Promise(function (resolve) {

        // Read one batch of child entries, then call itself again until the directory is exhausted.
        function readNextDirectoryBatch() {
            directoryReader.readEntries(
                function (childFileSystemEntries) {
                    if (childFileSystemEntries.length === 0) { // an empty batch means there are no entries left to read
                        resolve(collectedFiles); // finish with every File collected from this directory
                        return;
                    }

                    // Start recursive extraction for every file or folder in the current batch.
                    const extractionPromises = childFileSystemEntries.map(
                        function (childFileSystemEntry) {
                            return collectFilesFromFileSystemEntry(childFileSystemEntry); // files resolve directly; folders recurse
                        }
                    );

                    // Wait for the entire batch to finish before requesting the next batch.
                    Promise.all(extractionPromises).then(
                        function (extractedFileGroups) {

                            // A plain loop rather than push(...flat()), because a single deep subfolder can flatten to
                            // tens of thousands of files and spreading them into push() overflows the argument-count limit.
                            for (const file of extractedFileGroups.flat()) {
                                collectedFiles.push(file);
                            }

                            readNextDirectoryBatch(); // continue because readEntries may return only part of the directory at once. Reader returns in batches of max 100 items
                        }
                    );
                },
                function () {
                    resolve(collectedFiles); // on a read failure, return the files collected successfully so far
                }
            );
        }

        readNextDirectoryBatch();
    });
}

// endregion

export function createDropzone(element: HTMLElement, config: DropzoneConfig = {}): DropzoneEngine {
    if (!element || typeof element.addEventListener !== "function") {
        throw new TypeError("createDropzone: 'element' must be a DOM element.");
    }

    // region ===== Config =============================================================================================
    const {
        onChange, onError,
        accept, exclude,
        minSize, maxSize, maxFiles, maxTotalSize,
        multiple = true, openOnClick = true, disabled = false, dedupe = true,
        videoPreview = false,
        generateImageThumbnail = false, generateVideoThumbnail = false
    } = config;

    validateConfig();

    // Validate a list of dotted extensions (shared by 'accept' and 'exclude')
    function validateExtensionList(value: string[] | undefined, optionName: string) {
        if (!Array.isArray(value)) {
            throw new TypeError(`createDropzone: the '${optionName}' option must be an array of extension strings, e.g. ['.jpg', '.mp4'].`);
        }

        if (value.length === 0) {
            throw new TypeError(`createDropzone: the '${optionName}' option must list at least one extension; omit it instead.`);
        }

        value.forEach(function (extension) {
            if (typeof extension !== "string" || !extension.trim()) {
                throw new TypeError(`createDropzone: each '${optionName}' entry must be a non-empty extension string, got: ${JSON.stringify(extension)}`);
            }

            if (extension !== extension.trim()) {
                throw new TypeError(`createDropzone: '${optionName}' entries must have no surrounding whitespace, got: ${JSON.stringify(extension)}`);
            }

            if (!extension.startsWith(".")) {
                throw new TypeError(`createDropzone: '${optionName}' entries must be dotted extensions — use '.jpg', not 'jpg'.`);
            }
        });
    }

    function validateConfig() {

        // onChange is optional but must be a function when provided
        if (onChange !== undefined && typeof onChange !== "function") {
            throw new TypeError("createDropzone: the 'onChange' option must be a function when provided.");
        }

        // onError is optional but must be a function when provided
        if (onError !== undefined && typeof onError !== "function") {
            throw new TypeError("createDropzone: the 'onError' option must be a function when provided.");
        }

        // accept is optional; when provided, only these extensions are allowed
        if (accept !== undefined) {
            validateExtensionList(accept, "accept");
        }

        // exclude is optional; same shape as accept, but it blocks these extensions instead of allowing only them
        if (exclude !== undefined) {
            validateExtensionList(exclude, "exclude");
        }

        // minSize is optional; when provided, it must be a positive number of bytes (rejects empty/tiny files)
        if (minSize !== undefined && (!Number.isFinite(minSize) || minSize <= 0)) {
            throw new TypeError("createDropzone: the 'minSize' option must be a positive number of bytes.");
        }

        // maxSize is optional; when provided, it must be a positive number of bytes
        if (maxSize !== undefined && (!Number.isFinite(maxSize) || maxSize <= 0)) {
            throw new TypeError("createDropzone: the 'maxSize' option must be a positive number of bytes.");
        }

        if (minSize !== undefined && maxSize !== undefined && minSize > maxSize) {
            throw new TypeError("createDropzone: 'minSize' cannot exceed 'maxSize'.");
        }

        // maxFiles is optional; when provided, it must be a positive whole number (a cap on the total kept)
        if (maxFiles !== undefined && (!Number.isInteger(maxFiles) || maxFiles <= 0)) {
            throw new TypeError("createDropzone: the 'maxFiles' option must be a positive whole number.");
        }

        // maxTotalSize is optional; when provided, it must be a positive number of bytes (cap on the combined size)
        if (maxTotalSize !== undefined && (!Number.isFinite(maxTotalSize) || maxTotalSize <= 0)) {
            throw new TypeError("createDropzone: the 'maxTotalSize' option must be a positive number of bytes.");
        }

        // multiple is optional and must be a boolean
        if (typeof multiple !== "boolean") {
            throw new TypeError("createDropzone: the 'multiple' option must be a boolean.");
        }

        // openOnClick is optional and must be a boolean
        if (typeof openOnClick !== "boolean") {
            throw new TypeError("createDropzone: the 'openOnClick' option must be a boolean.");
        }

        // disabled is optional and must be a boolean
        if (typeof disabled !== "boolean") {
            throw new TypeError("createDropzone: the 'disabled' option must be a boolean.");
        }

        // dedupe is optional and must be a boolean
        if (typeof dedupe !== "boolean") {
            throw new TypeError("createDropzone: the 'dedupe' option must be a boolean.");
        }

        // videoPreview is optional and must be a boolean
        if (typeof videoPreview !== "boolean") {
            throw new TypeError("createDropzone: the 'videoPreview' option must be a boolean.");
        }

        if (typeof generateImageThumbnail !== "boolean") {
            throw new TypeError("createDropzone: the 'generateImageThumbnail' option must be a boolean.");
        }

        if (typeof generateVideoThumbnail !== "boolean") {
            throw new TypeError("createDropzone: the 'generateVideoThumbnail' option must be a boolean.");
        }
    }

    // endregion

    // region ===== Init ===============================================================================================
    let destroyed = false; // once torn down, a late-resolving async walk must not still fire callbacks
    const reportError = createErrorReporter(onError);

    function init() {
        if (onChange) subscribe(onChange); // register the onChange option as a subscriber

        registerAllEventListeners();
    }

    // endregion

    // region ===== Event Listeners ====================================================================================
    const cleanups: (() => void)[] = []; // teardown functions, collected so everything can be undone at once

    // Register an event listener and remember how to remove it during teardown.
    function registerEventListener<K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, handler: (event: HTMLElementEventMap[K]) => void) {
        const guardedHandler = function (event: HTMLElementEventMap[K]) {
            if (destroyed) return;
            handler(event);
        };
        target.addEventListener(type, guardedHandler as EventListener);

        cleanups.push(function () {
            target.removeEventListener(type, guardedHandler as EventListener); // remember how to detach it
        });
    }

    function registerAllEventListeners() {

        // Drag & Drop
        registerEventListener(element, "dragenter", function (event) {
            if (isDisabled) return;

            if (!hasFiles(event.dataTransfer)) return; // leave non-file drags untouched

            event.preventDefault();
            dragDepth++; // count this entry (children fire their own dragenter events too)
            setDraggingOver(true);
        });

        registerEventListener(element, "dragover", function (event: DragEvent) {
            if (isDisabled) return;

            if (!hasFiles(event.dataTransfer)) return; // leave non-file drags untouched

            event.preventDefault(); // without this on dragover, the browser refuses the drop entirely
            event.dataTransfer!.dropEffect = "copy"; // show the green "+" copy cursor instead of a move/no-drop one
            setDraggingOver(true); // self-heal: dragover keeps firing, so the highlight recovers even if a dragenter was missed (e.g. after setDisabled toggling mid-drag)
        });

        registerEventListener(element, "dragleave", function () {
            if (--dragDepth <= 0) { // only switch off once we've left the zone AND all its children
                dragDepth = 0; // prevent the nested-entry counter from becoming negative
                setDraggingOver(false);
            }
        });

        registerEventListener(element, "drop", function (event) {
            if (isDisabled) return;

            if (!hasFiles(event.dataTransfer)) return; // leave non-file drops untouched

            event.preventDefault(); // prevent the browser from opening or navigating to the dropped file
            dragDepth = 0; // a drop fires no dragleave, so reset the counter by hand
            setDraggingOver(false);
            if (destroyed) return; // a highlight subscriber may tear down the engine

            const transfer = event.dataTransfer;

            if (transfer && transfer.items && transfer.items.length) { // prefer the items API because it supports dropped folders
                collectDroppedFiles(transfer.items).then(
                    addFiles, // walk entries + recover any entry-less files
                    function (error) {
                        if (destroyed) return; // do not report after teardown

                        reportError("collect-failed", error instanceof Error ? error.message : "Unable to collect the dropped files.", {files: []});
                    }
                );
            } else {
                addFiles(transfer?.files ?? []); // browser without items API: take the flat file list
            }
        });

        // Drag Reset — the zone's own dragleave handles leaving the zone; these cover what it can't see:
        // a drop anywhere (even outside the zone), and the window losing focus mid-drag (dragged out to another app)
        registerEventListener(element.ownerDocument, "drop", function () {
            resetDrag();
        });

        registerEventListener(element.ownerDocument.defaultView!, "blur", function () {
            resetDrag();
        });

        // Page Guard — prevent unhandled file drops from opening files or navigating the browser.
        registerEventListener(element.ownerDocument, "dragover", function (event) {
            if (event.defaultPrevented) return; // another drop target already handled this event
            if (!hasFiles(event.dataTransfer)) return; // leave non-file drags untouched

            event.preventDefault(); // claim the unhandled file drag so controlled drop behavior is permitted
            event.dataTransfer!.dropEffect = "none"; // nothing here accepts files — show a "can't drop" cursor
        });

        registerEventListener(element.ownerDocument, "drop", function (event) {
            if (event.defaultPrevented) return; // another drop target already handled this event
            if (!hasFiles(event.dataTransfer)) return; // leave non-file drops untouched

            event.preventDefault(); // stop the browser from opening or navigating to the dropped file
        });

        // File Picker
        registerEventListener(element, "click", function () {
            if (!openOnClick) return; // click-to-open is disabled by config

            openFilePicker();
        });

        registerEventListener(filePicker, "change", function () {
            addFiles(filePicker.files ?? []);
            filePicker.value = ""; // reset so the same file can be picked again next time
        });
    }

    // endregion

    // region ===== State ==============================================================================================
    const notifier = createNotifier(getState);
    const subscriptions = new WeakMap<(state: DropzoneState) => void, (state: DropzoneState) => void>();

    // A snapshot of what the dropzone currently holds — consumers render from this.
    function getState(): DropzoneState {
        return {
            files: acceptedFiles.slice(), // a copy, so callers can't mutate the collection
            count: acceptedFiles.length,
            totalSize: acceptedFiles.reduce(function (total, file) {
                return total + file.size;
            }, 0),
            draggingOver: isDraggingOver,
            disabled: isDisabled
        };
    }

    // Subscribe to collection changes. The listener gets the state on every change (not
    // immediately — read getState() for the first paint). Returns an unsubscribe function.
    function subscribe(listener: (state: DropzoneState) => void): () => void {
        if (typeof listener !== "function") {
            throw new TypeError("createNotifier: 'listener' must be a function.");
        }
        if (destroyed) return function unsubscribe() {}; // dead engine: nothing will fire, and nothing gets retained

        let wrapped = subscriptions.get(listener);
        if (!wrapped) {
            wrapped = function (state) {
                listener({...state, files: state.files.slice()});
            };
            subscriptions.set(listener, wrapped);
        }

        return notifier.subscribe(wrapped);
    }

    // Emit the current state to every subscriber. Called after any change to the emitted state — the collection, the drag-over highlight, or the disabled flag.
    function notify() {
        notifier.notify();
    }

    // endregion

    // region ===== Files ==============================================================================================
    const acceptedFiles: File[] = []; // every file the dropzone currently holds, across all drops — the collection it owns

    function getFileSize(file: File): {size: number; sizeFormatted: string} {
        return {
            size: file.size,
            sizeFormatted: formatBytes(file.size, 1000)
        };
    }

    // Remove one file from the "files" array; returns whether a file was actually removed
    function removeFile(file: File): boolean {
        if (destroyed) return false;

        const index = acceptedFiles.indexOf(file);
        if (index === -1) return false; // not held — nothing removed

        acceptedFiles.splice(index, 1);
        if (!acceptedFiles.includes(file)) {
            revokeThumbnail(file); // release previews when the last reference leaves
            revokeVideoPreview(file);
        }
        notify(); // the collection changed — tell subscribers
        return true;
    }

    // Remove all files from the "files" array
    function clearFiles(): void {
        if (destroyed) return;
        if (!acceptedFiles.length) return; // nothing to clear, nothing to announce
        acceptedFiles.length = 0; // empty the existing array without replacing its reference
        revokeAllThumbnails(); // release every minted thumbnail url
        revokeAllVideoPreviews(); // release every minted video preview url
        notify();
    }

    // The intake for every source — drops, the picker, and programmatic callers alike. Filters the files
    // through validate → dedupe → limits, commits the accepted ones, notifies, and reports the outcome.
    // Takes a File, a FileList, or an array of File objects. Returns { accepted, errors }.
    function addFiles(files: File | FileList | File[]): DropzoneAddResult {
        if (destroyed) {
            return {accepted: [], errors: []}; // dead instance — nothing acquired
        }

        const normalizedFiles = files instanceof File ? [files] : files; // wrap a lone File so Array.from doesn't silently drop it
        const {accepted, errors} = validateFiles(normalizedFiles ? Array.from(normalizedFiles) : []);

        // A plain loop rather than push(...accepted), because spreading a very large batch into push() can overflow the argument-count limit.
        for (const file of accepted) {
            acceptedFiles.push(file);
            generateThumbnailIfEnabled(file);
        }

        // Collection grew — emit the new state to subscribers
        if (accepted.length) {
            notify();
        }

        // Fire each rejection/limit once at onError, fire-and-forget
        for (const error of errors) {
            if (destroyed) break;
            reportError(error.id, error.message, error.metadata);
        }

        return {accepted: accepted, errors: errors}; // report to programmatic callers; drop and pick ignore it
    }

    // Swap one held file for another in its place — for an edit flow (e.g. crop → save). Atomic: if the
    // replacement fails validation the original stays put and the reason fires at onError. Returns whether it swapped.
    function replaceFile(oldFile: File, newFile: File): boolean {
        if (destroyed) return false;

        // The replacement must be a File BEFORE we touch the collection — a Blob (e.g. from canvas.toBlob) or null
        // would throw inside validateFiles after the old file was already pulled, permanently losing it. Reject up front.
        if (!(newFile instanceof File)) {
            throw new TypeError("createDropzone: replaceFile's replacement must be a File — convert a Blob via new File([blob], name, { type }).");
        }

        const index = acceptedFiles.indexOf(oldFile);
        if (index === -1) return false; // not held — nothing to replace
        if (oldFile === newFile) return true; // identity is unchanged; preserve its cached previews

        acceptedFiles.splice(index, 1); // tentatively pull the old one so dedupe/limits judge the new one as if it's already gone
        const {accepted, errors} = validateFiles([newFile]);

        if (accepted.length) {
            acceptedFiles.splice(index, 0, newFile); // drop the replacement into the same slot — position preserved
            if (!acceptedFiles.includes(oldFile)) {
                revokeThumbnail(oldFile); // release previews when the last reference leaves
                revokeVideoPreview(oldFile);
            }
            generateThumbnailIfEnabled(newFile);
            notify();
            return true;
        }

        acceptedFiles.splice(index, 0, oldFile); // rejected — restore the original in place; nothing changed
        for (const error of errors) {
            if (destroyed) break;
            reportError(error.id, error.message, error.metadata);
        }
        return false;
    }

    // Does the file's name end with one of these dotted extensions? Case-insensitive.
    // Used by both the 'accept' allowlist and the 'exclude' blocklist.
    // NOTE: matches on the filename only — a user-controlled, trivially-spoofable string.
    // accept/exclude are UX filters, NOT a security boundary; verify real file contents elsewhere.
    function hasExtension(file: File, extensions: string[]) {
        const name = file.name.toLowerCase();

        return extensions.some(function (extension: string) {
            return name.endsWith(extension.toLowerCase());
        });
    }

    // The names already held, lowercased — a path can't hold two files of the same name.
    function getExistingNames() {
        const names = new Set();
        for (const file of acceptedFiles) {
            names.add(file.name.toLowerCase());
        }
        return names;
    }

    // How many times each (lowercased) name appears in a list of files.
    function getNameCounts(files: File[]) {
        const counts = new Map();
        for (const file of files) {
            const name = file.name.toLowerCase();
            counts.set(name, (counts.get(name) || 0) + 1);
        }
        return counts;
    }

    // Build one error record: a stable `id` (matching / i18n), a default human `message`, and the files
    // it concerns carried in `metadata` — the uniform {id, message, metadata} shape every engine fires.
    function createError(id: string, text: string, files: File[]): DropzoneError {
        return {id: id, message: text, metadata: {files: files}};
    }

    function validateFiles(files: File[]): DropzoneAddResult {
        const errors = [];

        // Phase 1 — type and size. One file per message.
        const candidates = [];
        for (const file of files) {

            // if file type isn't accepted
            if (accept && !hasExtension(file, accept)) {
                errors.push(createError("invalid-extension", `This file type isn't accepted. Accepted types: ${accept.join(", ")}.`, [file]));
                continue;
            }

            // if file type isn't allowed
            if (exclude && hasExtension(file, exclude)) {
                errors.push(createError("excluded-extension", `This file type isn't allowed. Blocked types: ${exclude.join(", ")}.`, [file]));
                continue;
            }

            // a 0-byte / empty file is never useful — always rejected, independent of minSize
            if (file.size === 0) {
                errors.push(createError("empty-file", "This file is empty.", [file]));
                continue;
            }

            // if file is below the minimum size
            if (minSize && file.size < minSize) {
                errors.push(createError("file-too-small", `This file is too small. Minimum size: ${formatBytes(minSize)}.`, [file]));
                continue;
            }

            // if file is too large
            if (maxSize && file.size > maxSize) {
                errors.push(createError("file-too-large", `This file is too large. Maximum size: ${formatBytes(maxSize)}.`, [file]));
                continue;
            }

            candidates.push(file);
        }

        // Phase 2 — dedupe by name. A name already in the collection, or appearing more
        // than once in this batch, is a path collision: none of the files sharing that
        // name get in. One message per clashing name, carrying every file that clashed.
        let accepted = candidates;
        if (dedupe) {
            accepted = [];
            const existingNames = getExistingNames();
            const candidateNameCounts = getNameCounts(candidates);
            const collidedByName = new Map(); // lowercased name -> the files that clashed on it

            for (const file of candidates) {
                const name = file.name.toLowerCase();
                const collides = existingNames.has(name) || candidateNameCounts.get(name) > 1;

                if (collides) {
                    const group = collidedByName.get(name) || [];
                    group.push(file);
                    collidedByName.set(name, group);
                    continue;
                }

                accepted.push(file);
            }

            for (const group of collidedByName.values()) {
                errors.push(createError("duplicate", `A file named "${group[0].name}" is a duplicate — it wasn't added.`, group));
            }
        }

        // Phase 3 — whole-drop limits on the survivors. Tripping one blocks the whole drop;
        // the blocked-but-valid files ride along on the message.

        // one-file mode: any result past a single file is refused, not replaced
        if (!multiple && acceptedFiles.length + accepted.length > 1) {
            errors.push(createError("single-file", "Only one file can be selected at a time.", accepted));
            return {accepted: [], errors: errors};
        }

        // if the drop pushes the total count over the cap, block the whole drop (we can't pick which to keep)
        if (maxFiles && acceptedFiles.length + accepted.length > maxFiles) {
            errors.push(createError("max-files", `Too many files. At most ${maxFiles} can be added.`, accepted));
            return {accepted: [], errors: errors};
        }

        // if the drop pushes the combined size over the cap, block the whole drop
        if (maxTotalSize) {
            const totalSize = acceptedFiles.concat(accepted).reduce(function (total, file) {
                return total + file.size;
            }, 0);

            if (totalSize > maxTotalSize) {
                errors.push(createError("max-total-size", `These files exceed the total size limit of ${formatBytes(maxTotalSize)}.`, accepted));
                return {accepted: [], errors: errors};
            }
        }

        return {accepted: accepted, errors: errors};
    }

    // endregion

    // region ===== Input Sources ======================================================================================

    // State
    let isDisabled = disabled; // a disabled dropzone ignores drags and clicks
    let isDraggingOver = false; // whether a file drag is currently over the zone (the highlighted state)
    let dragDepth = 0; // how many nested elements the drag is currently inside. This is the counter that stops the highlight flickering as the cursor crosses child elements

    // State Helpers
    function setDraggingOver(value: boolean) {
        if (isDraggingOver === value) return; // already in that state — don't re-fire

        isDraggingOver = value;
        notify();
    }

    function resetDrag() {
        dragDepth = 0;
        setDraggingOver(false);
    }

    // Public control — disabling gates everything: drag and click-to-open.
    function setDisabled(value: boolean): void {
        if (destroyed || isDisabled === value) return;

        isDisabled = value;

        if (value) {
            dragDepth = 0;
            isDraggingOver = false; // publish disabling and clearing the highlight together
        }

        notify();
    }

    // Does the drag carry files? Leave non-file drags (text, links) untouched.
    function hasFiles(dataTransfer: DataTransfer | null) {
        return !!dataTransfer && Array.prototype.includes.call(dataTransfer.types, "Files");
    }

    // Create a detached file input that opens the browser's native file-selection dialog.
    const filePicker = Object.assign(element.ownerDocument.createElement("input"), {
        type: "file",
        multiple,
        accept: accept ? accept.join(",") : "", // pass accepted extensions to the browser's picker filter
    });

    // Open the native file picker when the dropzone is active.
    function openFilePicker(): void {
        if (destroyed || isDisabled) return; // do nothing after teardown or while acquisition is disabled

        filePicker.click();
    }

    // endregion

    // region ===== Previews ===========================================================================================
    const pendingThumbnails = new Set<(url: string | null) => void>(); // in-flight video-thumbnail finishers, so destroy() can cancel a decode mid-flight
    const thumbnails = new Map<File, Promise<string | null>>(); // file -> Promise of its thumbnail url; the dropzone revokes these when files leave
    const videoPreviews = new Map<File, string>(); // file -> video object url; the dropzone revokes these when files leave

    function generateThumbnailIfEnabled(file: File) {
        if ((generateImageThumbnail && file.type.startsWith("image/")) ||
            (generateVideoThumbnail && file.type.startsWith("video/"))) {
            createThumbnail(file);
        }
    }

    // Build (or reuse) a thumbnail URL for a file. The dropzone OWNS the URL and revokes it when the file
    // leaves the collection — callers just render it and never revoke. Repeat calls reuse the same one.
    function createThumbnail(file: File): Promise<string | null> {
        if (destroyed) return Promise.resolve(null); // don't start new decode work after teardown
        if (thumbnails.has(file)) return thumbnails.get(file)!; // reuse the in-flight or finished result

        const thumbnail = resolveThumbnail(file).then(function (url) {
            // The file left mid-decode — drop the url now rather than leak it.
            if (url && (destroyed || !acceptedFiles.includes(file) || thumbnails.get(file) !== thumbnail)) {
                URL.revokeObjectURL(url);
                return null;
            }
            return url;
        });

        thumbnails.set(file, thumbnail);
        return thumbnail;
    }

    // Build (or reuse) a playable video preview URL for a file.
    function createVideoPreview(file: File): string | null {
        if (destroyed) return null;
        if (!videoPreview) return null;
        if (!file.type.startsWith("video/")) return null;
        if (videoPreviews.has(file)) return videoPreviews.get(file)!; // reuse the existing object url

        const videoPreviewUrl = URL.createObjectURL(file);

        videoPreviews.set(file, videoPreviewUrl);
        return videoPreviewUrl;
    }

    // Images use their own data; videos yield a frame; audio can supply embedded artwork.
    async function resolveThumbnail(file: File) {
        if (file.type.startsWith("image/")) { // images can be displayed directly without generating a new preview
            return URL.createObjectURL(file); // the image itself is the thumbnail
        }

        if (file.type.startsWith("video/")) { // videos require extracting a frame to use as their thumbnail
            return createVideoThumbnail(file); // extract frame from video, use frame as thumbnail
        }

        if (file.type.startsWith("audio/")) {
            return createAudioThumbnail(file); // extract supported embedded album artwork
        }

        return null; // nothing to use as thumbnail (e.g., a PDF, a ZIP, etc.)
    }

    // Revoke and forget a file's thumbnail — called when the file leaves the collection.
    function revokeThumbnail(file: File) {
        const thumbnail = thumbnails.get(file);
        if (!thumbnail) return;

        thumbnails.delete(file);
        thumbnail.then(function (url: string | null) {
            if (url) URL.revokeObjectURL(url);
        });
    }

    // Revoke and forget a file's video preview — called when the file leaves the collection.
    function revokeVideoPreview(file: File) {
        const videoPreviewUrl = videoPreviews.get(file);
        if (!videoPreviewUrl) return;

        videoPreviews.delete(file);
        URL.revokeObjectURL(videoPreviewUrl);
    }

    // Revoke and forget every thumbnail the dropzone minted — for clear-all and teardown.
    function revokeAllThumbnails() {
        for (const file of [...thumbnails.keys()]) {
            revokeThumbnail(file);
        }
    }

    // Revoke and forget every video preview the dropzone minted — for clear-all and teardown.
    function revokeAllVideoPreviews() {
        for (const file of [...videoPreviews.keys()]) {
            revokeVideoPreview(file);
        }
    }

    // Generate a thumbnail by loading the video, seeking to a frame, and drawing it onto a canvas.
    function createVideoThumbnail(file: File): Promise<string | null> {
        return new Promise(function (resolve) {
            const sourceUrl = URL.createObjectURL(file); // the video is read straight from this blob url
            const video = element.ownerDocument.createElement("video"); // detached element, never added to the page
            let settled = false; // "seeked" can fire repeatedly, and "error" can follow — capture and resolve only once

            // Stop waiting if the video cannot produce a thumbnail within ten seconds.
            const thumbnailTimeout = setTimeout(function () {
                settleWith(null); // abandon thumbnail generation and clean up its resources
            }, 10000);

            video.muted = true; // we don't want noise playing
            video.preload = "auto"; // fetch enough of the file to reach a seekable frame

            // Finish at once, release the source video URL, and resolve the thumbnail result.
            function settleWith(thumbnailUrl: string | null) {
                if (settled) return; // ignore duplicate timeout, media, or canvas callbacks

                settled = true; // prevent any later callback from completing the operation again
                pendingThumbnails.delete(settleWith); // this decode is finishing — drop it from the in-flight set
                clearTimeout(thumbnailTimeout); // cancel the timeout after success or an earlier failure
                video.pause(); // stop the video reading the blob
                video.removeAttribute("src"); // remove the source URL
                video.load(); // aborts the video's in-flight reads of the blob; revoking only after that avoids ERR_FILE_NOT_FOUND errors from reads that would otherwise still be pointing at a url we already revoked
                URL.revokeObjectURL(sourceUrl); // safe now: nothing is reading the blob anymore
                resolve(thumbnailUrl);
            }

            pendingThumbnails.add(settleWith); // register this decode so destroy() can tear it down before its 10s timeout

            // Wait until video duration and seeking information are available.
            video.addEventListener("loadedmetadata", function () {
                if (settled) return; // ignore metadata arriving after timeout or failure

                const durationIsUsable = Number.isFinite(video.duration) && video.duration > 0; // some encoders report Infinity/NaN

                if (durationIsUsable) {
                    video.currentTime = Math.min(3, video.duration / 2); // 3s in, or near the start otherwise
                } else {
                    video.currentTime = 0.1; // attempt a frame near the beginning when duration is unavailable
                }
            });

            // Capture the video frame after seeking reaches the requested time.
            video.addEventListener("seeked", function () {
                if (settled) return; // ignore seek completion after timeout or failure

                const canvas = element.ownerDocument.createElement("canvas"); // create a detached canvas for the captured frame
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;

                const context = canvas.getContext("2d");

                if (!context) { // stop when the browser cannot provide a canvas drawing context
                    settleWith(null);
                    return;
                }

                try {
                    context.drawImage(video, 0, 0, canvas.width, canvas.height); // copy the decoded frame into the canvas
                } catch {
                    settleWith(null); // fail cleanly if the decoded frame cannot be drawn
                    return;
                }

                // Convert the captured canvas frame into a thumbnail image blob.
                canvas.toBlob(function (blob) {
                    if (settled) return; // avoid creating a thumbnail URL after timeout or failure

                    settleWith(blob ? URL.createObjectURL(blob) : null); // return the thumbnail URL when blob creation succeeds
                });
            });

            // Handle video loading or decoding failure.
            video.addEventListener("error", function () {
                settleWith(null); // couldn't decode — no thumbnail
            });

            video.src = sourceUrl; // begin loading only after every required event listener is registered
        });
    }

    // Read ordinary ID3v2.3/v2.4 JPEG/PNG artwork; unsupported tag variations return no thumbnail.
    async function createAudioThumbnail(file: File): Promise<string | null> {
        try {
            const header = new Uint8Array(await file.slice(0, 10).arrayBuffer());
            if (destroyed || header.length !== 10 || String.fromCharCode(...header.subarray(0, 3)) !== "ID3") return null;

            const version = header[3];
            // Keep this parser small: skip extended, unsynchronised, experimental, and footer-bearing tags.
            if ((version !== 3 && version !== 4) || header[4] !== 0 || header[5] !== 0) return null;

            const sizeBytes = header.subarray(6, 10);
            if (sizeBytes.some(byte => byte & 0x80)) return null;

            const tagSize = sizeBytes.reduce((size, byte) => size * 128 + byte, 0);
            if (tagSize < 10 || tagSize > file.size - 10) return null;

            // Read only the declared metadata section, leaving the audio data untouched.
            const data = new Uint8Array(await file.slice(10, 10 + tagSize).arrayBuffer());
            if (destroyed || data.length !== tagSize) return null;

            let fallback = null;

            for (let offset = 0; offset + 10 <= data.length;) {
                if (data[offset] === 0) break; // tag padding

                const id = String.fromCharCode(...data.subarray(offset, offset + 4));
                if (!/^[A-Z0-9]{4}$/.test(id)) return null;

                const frameSizeBytes = data.subarray(offset + 4, offset + 8);
                if (version === 4 && frameSizeBytes.some(byte => byte & 0x80)) return null;

                const frameSize = frameSizeBytes.reduce((size, byte) => size * (version === 4 ? 128 : 256) + byte, 0);
                const flags = data[offset + 9];
                const end = offset + 10 + frameSize;
                if (frameSize === 0 || end > data.length) return null;

                const frame = data.subarray(offset + 10, end);
                offset = end;
                if (id !== "APIC" || flags !== 0) continue; // skip transformed frames (compression, encryption, etc.)

                const encoding = frame[0];
                if (encoding > (version === 3 ? 1 : 3)) continue;

                const mimeEnd = frame.indexOf(0, 1);
                if (mimeEnd < 2 || mimeEnd > 32 || mimeEnd + 2 >= frame.length) continue;

                const mime = String.fromCharCode(...frame.subarray(1, mimeEnd)).toLowerCase();
                if (mime !== "image/jpeg" && mime !== "image/png") continue;

                const pictureType = frame[mimeEnd + 1];
                const terminatorSize = encoding === 1 || encoding === 2 ? 2 : 1;
                let imageStart = mimeEnd + 2;

                // UTF-16 descriptions must be scanned on two-byte boundaries.
                while (imageStart + terminatorSize <= frame.length) {
                    if (frame[imageStart] === 0 && (terminatorSize === 1 || frame[imageStart + 1] === 0)) break;
                    imageStart += terminatorSize;
                }

                imageStart += terminatorSize;
                if (imageStart >= frame.length) continue;

                const picture = frame.subarray(imageStart);
                const isJpeg = picture.length >= 3 && picture[0] === 0xff && picture[1] === 0xd8 && picture[2] === 0xff;
                const isPng = picture.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => picture[index] === byte);
                if ((mime === "image/jpeg" && !isJpeg) || (mime === "image/png" && !isPng)) continue;

                if (pictureType === 3) { // prefer the front cover over other attached pictures
                    return URL.createObjectURL(new Blob([picture], {type: mime}));
                }

                if (!fallback) fallback = new Blob([picture], {type: mime});
            }

            return fallback ? URL.createObjectURL(fallback) : null;
        } catch {
            return null; // unreadable or malformed tags leave the file's icon as its preview
        }
    }

    // endregion

    // region ===== Tear Down ==========================================================================================

    // Tears down the whole dropzone: runs every registered cleanup, detaching all listeners it attached.
    function destroy(): void {
        if (destroyed) return;

        destroyed = true; // prevent further work and make future destroy calls harmless
        notifier.destroy();

        cleanups.forEach(function (cleanup) {
            cleanup();
        });

        cleanups.length = 0; // release references to the cleanup functions and their event targets
        resetDrag(); // clear the drag counter without notifying after teardown

        // Cancel any in-flight thumbnail decodes — otherwise a detached <video> keeps decoding until its
        // own 10s timeout. settleWith is idempotent, so this just tears each one down now (resolving it null).
        for (const settleThumbnail of [...pendingThumbnails]) {
            settleThumbnail(null); // forces settleWith → pause/load/revoke/clearTimeout, removes itself from the set
        }

        revokeAllThumbnails(); // revoke every thumbnail url the dropzone minted
        revokeAllVideoPreviews(); // revoke every video preview url the dropzone minted
    }

    // endregion

    init();

    return {
        getState,
        subscribe,
        addFiles,
        removeFile,
        clearFiles,
        replaceFile,
        getFileSize,
        openFilePicker,
        createThumbnail,
        createVideoPreview,
        setDisabled,
        destroy
    };
}
