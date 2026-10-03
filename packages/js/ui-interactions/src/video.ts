import {callConsumer, createErrorReporter, createNotifier} from 'strata-packages/ui-interactions/internal/core';

interface VideoElement extends HTMLVideoElement {
    webkitRequestFullscreen?: () => Promise<void> | void;
    webkitDisplayingFullscreen?: boolean;
    webkitEnterFullscreen?: () => void;
    webkitExitFullscreen?: () => void;
}
interface VideoContainer extends HTMLElement {
    webkitRequestFullscreen?: () => Promise<void> | void;
}
interface VideoDocument extends Document {
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => Promise<void> | void;
}
type VideoTap = {x: number; width: number; zone: string; time: number};

export type VideoSource = {
    src: string;
    type?: string;
};

export type VideoCaption = {
    src: string;
    language: string;
    label: string;
    kind?: "subtitles" | "captions";
    default?: boolean;
};

export type VideoArtwork = {
    src: string;
    sizes?: string;
    type?: string;
};

export type VideoMediaSession = {
    title?: string;
    artist?: string;
    album?: string;
    artwork?: VideoArtwork[];
} | null;

export type VideoError = {
    id: string;
    message: string;
};

export type VideoCaptionTrackState = {
    src: string;
    language: string;
    label: string;
    kind: string;
    active: boolean;
    readyState: number;
};

export type VideoState = {
    source: string;
    sources: VideoSource[];
    videoWidth: number;
    videoHeight: number;
    aspectRatio: number;
    paused: boolean;
    ended: boolean;
    playing: boolean;
    buffering: boolean;
    seeking: boolean;
    live: boolean;
    currentTime: number;
    currentTimeFormatted: string;
    duration: number;
    durationFormatted: string;
    bufferedRanges: Array<{startPercent: number; endPercent: number}>;
    remainingTime: number;
    remainingTimeFormatted: string;
    volume: number;
    volumeFormatted: string;
    muted: boolean;
    playbackRate: number;
    loop: boolean;
    abLoopStart: number;
    abLoopEnd: number;
    abLoopStartFormatted: string;
    abLoopEndFormatted: string;
    abLoopReady: boolean;
    abLoopPhase: "idle" | "pending" | "looping";
    autoplay: boolean;
    autoplayAttempted: boolean;
    autoplayBlocked: boolean;
    poster: string;
    captions: {
        enabled: boolean;
        src: string;
        language: string;
        label: string;
        tracks: VideoCaptionTrackState[];
    };
    fullscreen: boolean;
    fullscreenSupported: boolean;
    pictureInPicture: boolean;
    pictureInPictureSupported: boolean;
    keyboardShortcuts: boolean;
    touchGestures: boolean;
    persistSettings: boolean;
    watchProgress: {
        enabled: boolean;
        restored: boolean;
        savedTime: number;
        savedTimeFormatted: string;
        watchedPercent: number;
    };
};

export type VideoConfig = {
    onChange?: (state: VideoState) => void;
    onError?: (error: VideoError) => void;
    onSingleClick?: (tap: VideoTap) => void;
    onDoubleClick?: (tap: VideoTap) => void;
    onSingleTap?: (tap: VideoTap) => void;
    onDoubleTap?: (tap: VideoTap) => void;
    videoId?: string;
    playerContainer?: VideoContainer;
    autoplay?: boolean;
    autoplayMuted?: boolean;
    loop?: boolean;
    poster?: string;
    thumbnails?: string;
    thumbnailScale?: number;
    captions?: VideoCaption[];
    sources?: VideoSource[];
    keyboardShortcuts?: boolean;
    keyboardSeekStep?: number;
    keyboardVolumeStep?: number;
    touchGestures?: boolean;
    mediaSession?: VideoMediaSession;
    watchProgress?: boolean;
    watchProgressSaveInterval?: number;
    persistSettings?: boolean;
};

export type VideoEngine = {
    getState: () => VideoState;
    subscribe: (listener: (state: VideoState) => void) => () => void;
    load: () => boolean;
    setSources: (sources: VideoSource[]) => boolean;
    play: () => Promise<boolean>;
    togglePlayback: () => void;
    pause: () => boolean;
    stop: () => boolean;
    seek: (time: number) => boolean;
    seekForward: (seconds?: number) => boolean;
    seekBackward: (seconds?: number) => boolean;
    seekToPercent: (percent: number) => boolean;
    getSeekTimeAtPercent: (percent: number) => number;
    getSeekPreviewAtPercent: (percent: number) => {
        percent: number;
        time: number;
        timeFormatted: string;
        remainingTime: number;
        remainingTimeFormatted: string;
        thumbnail: unknown;
    };
    getSeekPreviewAtPosition: (position: number, width: number) => {
        percent: number;
        time: number;
        timeFormatted: string;
        remainingTime: number;
        remainingTimeFormatted: string;
        thumbnail: unknown;
    };
    setVolume: (volume: number) => boolean;
    increaseVolume: (step?: number) => boolean;
    decreaseVolume: (step?: number) => boolean;
    setMuted: (enabled: boolean) => boolean;
    toggleMuted: () => boolean;
    setAutoplay: (enabled: boolean) => Promise<boolean>;
    setLoop: (enabled: boolean) => boolean;
    toggleLoop: () => boolean;
    setMediaSession: (mediaSession: VideoMediaSession) => boolean;
    setAbLoopStart: (time?: number) => boolean;
    setAbLoopEnd: (time?: number) => boolean;
    clearAbLoop: () => boolean;
    retry: () => Promise<boolean>;
    clearPersistedSettings: () => boolean;
    setPlaybackRate: (rate: number) => boolean;
    increasePlaybackRate: (step?: number) => boolean;
    decreasePlaybackRate: (step?: number) => boolean;
    resetPlaybackRate: () => boolean;
    setCaption: (caption: VideoCaptionTrackState | null) => boolean;
    enterPictureInPicture: () => Promise<boolean>;
    exitPictureInPicture: () => Promise<boolean>;
    enterFullscreen: () => Promise<boolean>;
    exitFullscreen: () => Promise<boolean>;
    setKeyboardShortcuts: (enabled: boolean) => boolean;
    listKeyboardShortcuts: () => Array<{id: string; keys: string[]; message: string}>;
    setTouchGestures: (enabled: boolean) => boolean;
    resumeWatchProgress: () => boolean;
    destroy: () => void;
};

export function formatTime(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = Math.floor(safeSeconds % 60).toString().padStart(2, "0");

    return `${minutes}:${remainingSeconds}`;
}

function getLocalStorage(element: HTMLVideoElement) {
    try {
        return element.ownerDocument.defaultView!.localStorage;
    } catch {
        return null;
    }
}

export function createVideo(video: VideoElement, config: VideoConfig = {}): VideoEngine {
    if (!video || typeof video.addEventListener !== "function" || typeof video.play !== "function" || typeof video.pause !== "function") {
        throw new TypeError("createVideo: 'video' must be a media element.");
    }

    // region ===== Config =============================================================================================
    const {
        onChange, onError,
        onSingleClick, onDoubleClick, onSingleTap, onDoubleTap,
        videoId, playerContainer = video,
        autoplay = false, autoplayMuted = false, loop = video.loop,
        poster, thumbnails, thumbnailScale = 1, captions = [], sources = [],
        keyboardShortcuts = true, keyboardSeekStep = 5, keyboardVolumeStep = 0.05,
        touchGestures = true, mediaSession,
        watchProgress = false, watchProgressSaveInterval = 1000, persistSettings = false
    } = config;
    let mediaSessionMetadata = mediaSession;

    validateConfig();

    function validateConfig() {

        // On Change
        if (onChange !== undefined && typeof onChange !== "function") {
            throw new TypeError("createVideo: the 'onChange' option must be a function when provided.");
        }

        // On Error
        if (onError !== undefined && typeof onError !== "function") {
            throw new TypeError("createVideo: the 'onError' option must be a function when provided.");
        }

        // On Single Click
        if (onSingleClick !== undefined && typeof onSingleClick !== "function") {
            throw new TypeError("createVideo: the 'onSingleClick' option must be a function when provided.");
        }

        // On Double Click
        if (onDoubleClick !== undefined && typeof onDoubleClick !== "function") {
            throw new TypeError("createVideo: the 'onDoubleClick' option must be a function when provided.");
        }

        // On Single Tap
        if (onSingleTap !== undefined && typeof onSingleTap !== "function") {
            throw new TypeError("createVideo: the 'onSingleTap' option must be a function when provided.");
        }

        // On Double Tap
        if (onDoubleTap !== undefined && typeof onDoubleTap !== "function") {
            throw new TypeError("createVideo: the 'onDoubleTap' option must be a function when provided.");
        }

        // Video Id
        if (videoId !== undefined && typeof videoId !== "string") {
            throw new TypeError("createVideo: the 'videoId' option must be a string when provided.");
        }

        // Player Container — used as the target for fullscreen, keyboard shortcuts, and touch gestures alike.
        if (!playerContainer || typeof playerContainer.addEventListener !== "function") {
            throw new TypeError("createVideo: the 'playerContainer' option must be a DOM element.");
        }

        // Autoplay
        if (typeof autoplay !== "boolean") {
            throw new TypeError("createVideo: the 'autoplay' option must be a boolean.");
        }

        // Autoplay Muted
        if (typeof autoplayMuted !== "boolean") {
            throw new TypeError("createVideo: the 'autoplayMuted' option must be a boolean.");
        }

        // Loop
        if (typeof loop !== "boolean") {
            throw new TypeError("createVideo: the 'loop' option must be a boolean.");
        }

        // Poster
        if (poster !== undefined && (typeof poster !== "string" || !poster)) {
            throw new TypeError("createVideo: the 'poster' option must be a non-empty string when provided.");
        }

        // Thumbnails
        if (thumbnails !== undefined && (typeof thumbnails !== "string" || !thumbnails)) {
            throw new TypeError("createVideo: the 'thumbnails' option must be a non-empty string.");
        }

        // Thumbnail Scale
        if (typeof thumbnailScale !== "number" || !Number.isFinite(thumbnailScale) || thumbnailScale <= 0) {
            throw new TypeError("createVideo: the 'thumbnailScale' option must be a positive finite number.");
        }

        // Captions
        if (!Array.isArray(captions)) {
            throw new TypeError("createVideo: captions must be an array.");
        }

        const captionSources = new Set();

        captions.forEach(function (caption) {
            if (!caption || typeof caption !== "object") {
                throw new TypeError("createVideo: each caption must be an object.");
            }

            if (typeof caption.src !== "string" || !caption.src) {
                throw new TypeError("createVideo: each caption must include a non-empty src.");
            }

            if (typeof caption.language !== "string" || !caption.language) {
                throw new TypeError("createVideo: each caption must include a non-empty language.");
            }

            if (typeof caption.label !== "string" || !caption.label) {
                throw new TypeError("createVideo: each caption must include a non-empty label.");
            }

            if (caption.kind !== undefined && !["subtitles", "captions"].includes(caption.kind)) {
                throw new TypeError("createVideo: caption kind must be 'subtitles' or 'captions'.");
            }

            if (caption.default !== undefined && typeof caption.default !== "boolean") {
                throw new TypeError("createVideo: each caption's default must be a boolean when provided.");
            }

            if (captionSources.has(caption.src)) {
                throw new TypeError(`createVideo: duplicate caption src '${caption.src}' is not allowed.`);
            }

            captionSources.add(caption.src);
        });

        // Sources
        validateSources(sources);

        // Keyboard Shortcuts
        if (typeof keyboardShortcuts !== "boolean") {
            throw new TypeError("createVideo: the 'keyboardShortcuts' option must be a boolean.");
        }

        // Keyboard Seek Step
        if (typeof keyboardSeekStep !== "number" || !Number.isFinite(keyboardSeekStep) || keyboardSeekStep <= 0) {
            throw new TypeError("createVideo: the 'keyboardSeekStep' option must be a positive number.");
        }

        // Keyboard Volume Step
        if (typeof keyboardVolumeStep !== "number" || !Number.isFinite(keyboardVolumeStep) || keyboardVolumeStep <= 0 || keyboardVolumeStep > 1) {
            throw new TypeError("createVideo: the 'keyboardVolumeStep' option must be greater than 0 and at most 1.");
        }

        // Touch Gestures
        if (typeof touchGestures !== "boolean") {
            throw new TypeError("createVideo: the 'touchGestures' option must be a boolean.");
        }

        // Media Session
        validateMediaSession(mediaSession);

        // Watch Progress
        if (typeof watchProgress !== "boolean") {
            throw new TypeError("createVideo: the 'watchProgress' option must be a boolean.");
        }

        // Watch Progress requires a videoId, since it scopes the saved position to this specific video.
        if (watchProgress && (typeof videoId !== "string" || !videoId.trim())) {
            throw new TypeError("createVideo: the 'videoId' option must be a non-empty string when 'watchProgress' is true.");
        }

        // Watch Progress Save Interval
        if (typeof watchProgressSaveInterval !== "number" || !Number.isFinite(watchProgressSaveInterval) || watchProgressSaveInterval < 0) {
            throw new TypeError("createVideo: the 'watchProgressSaveInterval' option must be a non-negative number.");
        }

        // Persist Settings
        if (typeof persistSettings !== "boolean") {
            throw new TypeError("createVideo: the 'persistSettings' option must be a boolean.");
        }
    }

    function validateSources(value: VideoSource[]) {
        if (!Array.isArray(value)) {
            throw new TypeError("createVideo: sources must be an array.");
        }

        value.forEach(function (source) {
            if (!source || typeof source !== "object") {
                throw new TypeError("createVideo: each source must be an object.");
            }

            if (typeof source.src !== "string" || !source.src) {
                throw new TypeError("createVideo: each source must include a non-empty src.");
            }

            if (source.type !== undefined && typeof source.type !== "string") {
                throw new TypeError("createVideo: each source's type must be a string when provided.");
            }
        });
    }

    function validateMediaSession(value: VideoMediaSession | undefined) {
        if (value === undefined || value === null) return;

        if (typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError("createVideo: mediaSession must be a metadata object.");
        }

        (["title", "artist", "album"] as const).forEach(function (key) {
            if (value[key] !== undefined && typeof value[key] !== "string") {
                throw new TypeError(`createVideo: mediaSession.${key} must be a string when provided.`);
            }
        });

        if (value.artwork !== undefined && !Array.isArray(value.artwork)) {
            throw new TypeError("createVideo: mediaSession.artwork must be an array when provided.");
        }

        (value.artwork || []).forEach(function (item) {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
                throw new TypeError("createVideo: mediaSession artwork items must be objects.");
            }

            if (typeof item.src !== "string" || !item.src) {
                throw new TypeError("createVideo: mediaSession artwork items must include a non-empty src.");
            }

            if (item.sizes !== undefined && typeof item.sizes !== "string") {
                throw new TypeError("createVideo: mediaSession artwork sizes must be a string when provided.");
            }

            if (item.type !== undefined && typeof item.type !== "string") {
                throw new TypeError("createVideo: mediaSession artwork type must be a string when provided.");
            }
        });
    }

    // endregion

    // region ===== Init ===============================================================================================
    const ownerDocument: VideoDocument = video.ownerDocument; // the video's own document, so PiP exit/state reads work across realms/iframes
    const browserNavigator = ownerDocument.defaultView ? ownerDocument.defaultView!.navigator : null;
    let destroyed = false; // late media events must not still fire callbacks after teardown

    function init() {

        // Wire up — subscribers and event listeners first, so nothing that follows goes unheard
        if (onChange) subscribe(onChange); // register the onChange option as a subscriber

        registerAllEventListeners();

        // Load the media first — the native load() resets playbackRate, so it must run before preferences are restored
        if (sources.length) {
            applySources(sources);
        } else {
            loadPreviewThumbnails();
        }

        applyLoop();
        applyPersistedSettings(); // restore persisted preferences — must precede applyCaptions: a saved caption selection overrides the `default`-flagged track
        applyCaptions();
        applyMediaSession();

        // Apply config to the media element
        applyPoster();

        // Go
        if (autoplayEnabled) {
            startAutoplay();
        }
    }

    // endregion

    // region ===== Event Listeners ====================================================================================
    const cleanups: (() => void)[] = []; // teardown functions, collected so everything can be undone at once

    function registerEventListener<K extends keyof HTMLElementEventMap | "enterpictureinpicture" | "leavepictureinpicture" | "webkitfullscreenchange" | "webkitbeginfullscreen" | "webkitendfullscreen">(target: EventTarget, type: K, handler: (event: K extends keyof HTMLElementEventMap ? HTMLElementEventMap[K] : Event) => void) {
        const guardedHandler = function (event: Event) {
            if (!destroyed) (handler as EventListener)(event);
        };
        target.addEventListener(type, guardedHandler);

        cleanups.push(function () {
            target.removeEventListener(type, guardedHandler); // detach the exact listener that was registered
        });
    }

    function registerAllEventListeners() {

        // Poster Controls
        registerEventListener(video, "play", function () {
            clearPoster();
            notify();
        });

        // AB Loop Controls / Watch Progress
        registerEventListener(video, "timeupdate", function () {
            syncAbLoop();
            if (destroyed) return;
            saveWatchProgress(false);
            notify();
        });

        // Playback Controls
        registerEventListener(video, "progress", function () {
            notify();
        });

        registerEventListener(video, "durationchange", function () {
            notify();
        });

        registerEventListener(video, "seeking", function () {
            notify();
        });

        // Watch Progress / State
        registerEventListener(video, "seeked", function () {
            saveWatchProgress(true);
            notify();
        });

        registerEventListener(video, "pause", function () {
            setBuffering(false);
            saveWatchProgress(true);
            notify();
        });

        registerEventListener(video, "ended", function () {
            setBuffering(false);
            saveWatchProgress(true);
            notify();
        });

        registerEventListener(video, "loadedmetadata", function () {
            notify();
        });

        // State
        registerEventListener(video, "waiting", function () {
            setBuffering(true);
            notify();
        });

        registerEventListener(video, "stalled", function () {
            setBuffering(true);
            notify();
        });

        registerEventListener(video, "playing", function () {
            setBuffering(false);
            notify();
        });

        registerEventListener(video, "canplay", function () {
            setBuffering(false);
            notify();
        });

        // Persisted Settings — no saves here: persistence rides the setters, so engine/browser-caused
        // changes (a native load() rate reset, autoplay's forced mute) never masquerade as user preference.
        registerEventListener(video, "volumechange", function () {
            notify();
        });

        registerEventListener(video, "ratechange", function () {
            notify();
        });

        // Picture-in-Picture Controls
        registerEventListener(video, "enterpictureinpicture", function () {
            notify();
        });

        registerEventListener(video, "leavepictureinpicture", function () {
            notify();
        });

        // Fullscreen Controls
        registerEventListener(ownerDocument, "fullscreenchange", function () {
            notify();
        });

        registerEventListener(ownerDocument, "webkitfullscreenchange", function () {
            notify();
        });

        registerEventListener(video, "webkitbeginfullscreen", function () {
            notify();
        });

        registerEventListener(video, "webkitendfullscreen", function () {
            notify();
        });

        // Keyboard Shortcuts
        registerEventListener(playerContainer, "keydown", function (event) {
            handleKeyboardShortcut(event);
        });

        // Pointer Events
        registerEventListener(playerContainer, "pointerup", function (event) {
            handlePointerEvent(event);
        });

        // Error Handling
        registerEventListener(video, "error", function () {
            reportMediaError();
        });
    }

    // endregion

    // region ===== Error Handling =====================================================================================
    const reportError = createErrorReporter(onError);

    function reportMediaError(playbackError: unknown = null) {
        const mediaError = video.error;

        if (mediaError) {
            if (mediaError.code === 1) {
                return reportError("loading-aborted", "Video loading was interrupted.");
            }

            if (mediaError.code === 2) {
                return reportError("network-error", "The video could not be loaded because of a network error.");
            }

            if (mediaError.code === 3) {
                return reportError("decode-error", "The video could not be decoded.");
            }

            if (mediaError.code === 4) {
                return reportError("unsupported-source", "This video source is not supported.");
            }

            return reportError("media-error", "The video could not be loaded.");
        }

        if (playbackError && (playbackError as {name?: unknown}).name === "NotAllowedError") {
            return reportError("playback-blocked", "Playback was blocked by the browser.");
        }

        if (playbackError) {
            return reportError("playback-failed", "Playback could not start.");
        }

        return reportError("media-error", "The video could not be loaded.");
    }

    // endregion

    // region ===== State ==============================================================================================
    let stateChanged = false; // engine-owned primitives mark changes at their mutation sites
    let hasNotified = false;
    let observedMedia: ReturnType<typeof getMediaObservation>;
    const subscriptions = new WeakMap<(state: VideoState) => void, (state: VideoState) => void>();
    const notifier = createNotifier(function () {
        const state = getState();
        syncMediaSessionState(state);
        return state;
    });

    // Subscription is silent. Stable wrappers preserve Set identity while each consumer owns its nested snapshots.
    function subscribe(listener: (state: VideoState) => void): () => void {
        if (typeof listener !== "function") {
            throw new TypeError("createNotifier: 'listener' must be a function.");
        }
        if (destroyed) return function unsubscribe() {};

        let wrapped = subscriptions.get(listener);
        if (!wrapped) {
            wrapped = function (state) {
                listener({
                    ...state,
                    sources: state.sources.map(function (source) { return {...source}; }),
                    bufferedRanges: state.bufferedRanges.map(function (range) { return {...range}; }),
                    captions: {...state.captions, tracks: state.captions.tracks.map(function (track) { return {...track}; })},
                    watchProgress: {...state.watchProgress}
                });
            };
            subscriptions.set(listener, wrapped);
        }

        return notifier.subscribe(wrapped);
    }

    // Observe published browser-owned primitives; state reads remain live and do not acknowledge changes.
    function getMediaObservation() {
        return {
            source: getSource(), sources: getSources(), paused: isPaused(), ended: hasEnded(),
            seeking: isSeeking(), live: isLive(), currentTime: getCurrentTime(), duration: getDuration(),
            bufferedRanges: getBufferedRanges(getDuration()), volume: getVolume(), muted: isMuted(),
            playbackRate: getPlaybackRate(), loop: isLoopEnabled(), savedTime: getSavedWatchTime(),
            videoWidth: getVideoWidth(), videoHeight: getVideoHeight(), poster: getPoster(),
            fullscreen: isFullscreenActive(), fullscreenSupported: isFullscreenSupported(),
            pictureInPicture: isPictureInPictureActive(), pictureInPictureSupported: isPictureInPictureSupported(),
            tracks: captions.map(function (caption, index) {
                const track = captionTrackElements[index];
                return {kind: track ? track.kind : (caption.kind || "subtitles"), readyState: track ? track.readyState : 0};
            })
        };
    }

    function notify() {
        if (destroyed) return;
        const next = getMediaObservation();
        const previous = observedMedia;
        const changed = stateChanged
            || next.source !== previous.source || next.paused !== previous.paused || next.ended !== previous.ended
            || next.seeking !== previous.seeking || next.live !== previous.live || next.currentTime !== previous.currentTime
            || next.duration !== previous.duration || next.volume !== previous.volume || next.muted !== previous.muted
            || next.playbackRate !== previous.playbackRate || next.loop !== previous.loop || next.savedTime !== previous.savedTime
            || next.videoWidth !== previous.videoWidth || next.videoHeight !== previous.videoHeight || next.poster !== previous.poster
            || next.fullscreen !== previous.fullscreen || next.fullscreenSupported !== previous.fullscreenSupported
            || next.pictureInPicture !== previous.pictureInPicture || next.pictureInPictureSupported !== previous.pictureInPictureSupported
            || next.sources.length !== previous.sources.length
            || next.sources.some(function (source, index) {
                return source.src !== previous.sources[index].src || source.type !== previous.sources[index].type;
            })
            || next.bufferedRanges.length !== previous.bufferedRanges.length
            || next.bufferedRanges.some(function (range, index) {
                return range.startPercent !== previous.bufferedRanges[index].startPercent
                    || range.endPercent !== previous.bufferedRanges[index].endPercent;
            })
            || next.tracks.length !== previous.tracks.length
            || next.tracks.some(function (track, index) {
                return track.kind !== previous.tracks[index].kind || track.readyState !== previous.tracks[index].readyState;
            });
        observedMedia = next;
        stateChanged = false;
        if (changed) {
            hasNotified = true;
            notifier.notify();
        }
    }

    // A snapshot of the media element's current playback state — consumers render from this.
    function getState(): VideoState {
        const source = getSource();
        const sources = getSources();
        const videoWidth = getVideoWidth();
        const videoHeight = getVideoHeight();
        const aspectRatio = getAspectRatio();
        const paused = isPaused();
        const ended = hasEnded();
        const playing = isPlaying();
        const buffering = isBuffering();
        const seeking = isSeeking();
        const live = isLive();
        const currentTime = getCurrentTime();
        const currentTimeFormatted = getCurrentTimeFormatted();
        const duration = getDuration();
        const durationFormatted = getDurationFormatted();
        const bufferedRanges = getBufferedRanges(duration);
        const remainingTime = getRemainingTime(currentTime, duration);
        const remainingTimeFormatted = getRemainingTimeFormatted();
        const volume = getVolume();
        const volumeFormatted = getVolumeFormatted();
        const muted = isMuted();
        const playbackRate = getPlaybackRate();
        const loop = isLoopEnabled();
        const abLoopStart = getAbLoopStart();
        const abLoopEnd = getAbLoopEnd();
        const abLoopStartFormatted = getAbLoopStartFormatted();
        const abLoopEndFormatted = getAbLoopEndFormatted();
        const abLoopReady = isAbLoopReady();
        const abLoopPhase = getAbLoopPhase();
        const autoplay = isAutoplayEnabled();
        const autoplayAttempted = isAutoplayAttempted();
        const autoplayBlocked = isAutoplayBlocked();
        const poster = getPoster();
        const captions = getCaptionsState();
        const fullscreen = isFullscreenActive();
        const fullscreenSupported = isFullscreenSupported();
        const pictureInPicture = isPictureInPictureActive();
        const pictureInPictureSupported = isPictureInPictureSupported();
        const keyboardShortcuts = isKeyboardShortcutsEnabled();
        const touchGestures = isTouchGesturesEnabled();
        const persistSettings = isPersistSettingsEnabled();
        const watchProgress = getWatchProgressState(currentTime, duration);

        return {
            source: source,
            sources: sources,
            videoWidth: videoWidth,
            videoHeight: videoHeight,
            aspectRatio: aspectRatio,
            paused: paused,
            ended: ended,
            playing: playing,
            buffering: buffering,
            seeking: seeking,
            live: live,
            currentTime: currentTime,
            currentTimeFormatted: currentTimeFormatted,
            duration: duration,
            durationFormatted: durationFormatted,
            bufferedRanges: bufferedRanges,
            remainingTime: remainingTime,
            remainingTimeFormatted: remainingTimeFormatted,
            volume: volume,
            volumeFormatted: volumeFormatted,
            muted: muted,
            playbackRate: playbackRate,
            loop: loop,
            abLoopStart: abLoopStart,
            abLoopEnd: abLoopEnd,
            abLoopStartFormatted: abLoopStartFormatted,
            abLoopEndFormatted: abLoopEndFormatted,
            abLoopReady: abLoopReady,
            abLoopPhase: abLoopPhase,
            autoplay: autoplay,
            autoplayAttempted: autoplayAttempted,
            autoplayBlocked: autoplayBlocked,
            poster: poster,
            captions: captions,
            fullscreen: fullscreen,
            fullscreenSupported: fullscreenSupported,
            pictureInPicture: pictureInPicture,
            pictureInPictureSupported: pictureInPictureSupported,
            keyboardShortcuts: keyboardShortcuts,
            touchGestures: touchGestures,
            persistSettings: persistSettings,
            watchProgress: watchProgress
        };
    }

    function getSource() {
        return video.currentSrc || video.src || "";
    }

    function getSources() {
        const sources = [];

        if (video.src) {
            sources.push({src: video.src, type: ""});
        }

        video.querySelectorAll("source").forEach(function (source) {
            sources.push({
                src: source.src,
                type: source.type || ""
            });
        });

        return sources;
    }

    function getVideoWidth() {
        return video.videoWidth || 0;
    }

    function getVideoHeight() {
        return video.videoHeight || 0;
    }

    function getAspectRatio() {
        if (!video.videoWidth || !video.videoHeight) return 0;

        return video.videoWidth / video.videoHeight;
    }

    function isPaused() {
        return video.paused;
    }

    function hasEnded() {
        return video.ended;
    }

    function isPlaying() {
        return !video.paused && !video.ended;
    }

    function isBuffering() {
        return buffering;
    }

    function getBufferedRanges(duration: number) {
        const ranges: {startPercent: number; endPercent: number;}[] = [];
        if (!duration || !video.buffered) return ranges;

        for (let index = 0; index < video.buffered.length; index++) {
            const start = video.buffered.start(index);
            const end = video.buffered.end(index);

            ranges.push({
                startPercent: start / duration * 100,
                endPercent: end / duration * 100
            });
        }

        return ranges;
    }

    function isSeeking() {
        return video.seeking;
    }

    function isLive() {
        return video.duration === Infinity; // a live stream reports an infinite duration
    }

    function getCurrentTime() {
        if (!Number.isFinite(video.currentTime)) return 0;

        return video.currentTime;
    }

    function getCurrentTimeFormatted() {
        return formatTime(getCurrentTime());
    }

    function getDuration() {
        if (!Number.isFinite(video.duration)) return 0;

        return video.duration;
    }

    function getDurationFormatted() {
        return formatTime(getDuration());
    }

    function getRemainingTime(currentTime: number, duration: number) {
        if (!duration) return 0;

        return Math.max(0, duration - currentTime);
    }

    function getRemainingTimeFormatted() {
        return `-${formatTime(getRemainingTime(getCurrentTime(), getDuration()))}`;
    }

    function getVolume() {
        return video.volume;
    }

    function getVolumeFormatted() {
        return formatVolume(getVolume());
    }

    function isMuted() {
        return video.muted;
    }

    function getPlaybackRate() {
        return video.playbackRate;
    }

    function isLoopEnabled() {
        return video.loop;
    }

    function getAbLoopStart() {
        return abLoopStart;
    }

    function getAbLoopEnd() {
        return abLoopEnd;
    }

    function getAbLoopStartFormatted() {
        return formatTime(getAbLoopStart());
    }

    function getAbLoopEndFormatted() {
        return formatTime(getAbLoopEnd());
    }

    function isAbLoopReady() {
        return getAbLoopEnd() > getAbLoopStart();
    }

    function getAbLoopPhase() {
        if (isAbLoopReady()) return "looping";
        if (getAbLoopStart() > 0) return "pending";

        return "idle";
    }

    function isAutoplayEnabled() {
        return autoplayEnabled;
    }

    function isAutoplayAttempted() {
        return autoplayAttempted;
    }

    function isAutoplayBlocked() {
        return autoplayBlocked;
    }

    function getPoster() {
        return video.poster;
    }

    function getCaptionsState() {
        const tracks = captions.map(function (caption, index) {
            // captions and captionTrackElements are built in the same order by applyCaptions(), so index directly instead of matching on track.src — the DOM resolves that to an absolute URL, which won't match caption.src.
            const trackElement = captionTrackElements[index];

            return {
                src: caption.src,
                language: caption.language,
                label: caption.label,
                kind: trackElement ? trackElement.kind : (caption.kind || "subtitles"),
                active: selectedCaption !== null && caption.src === selectedCaption.src,
                readyState: trackElement ? trackElement.readyState : 0
            };
        });

        return {
            enabled: Boolean(selectedCaption),
            src: selectedCaption ? selectedCaption.src : "",
            language: selectedCaption ? selectedCaption.language : "",
            label: selectedCaption ? selectedCaption.label : "",
            tracks: tracks
        };
    }

    function isFullscreenActive() {
        return getFullscreenElement() === playerContainer || getFullscreenElement() === video || Boolean(video.webkitDisplayingFullscreen);
    }

    function isFullscreenSupported() {
        return Boolean(playerContainer.requestFullscreen || playerContainer.webkitRequestFullscreen || video.webkitEnterFullscreen);
    }

    function isPictureInPictureActive() {
        return ownerDocument.pictureInPictureElement === video;
    }

    function isPictureInPictureSupported() {
        return Boolean(ownerDocument.pictureInPictureEnabled && typeof video.requestPictureInPicture === "function" && typeof ownerDocument.exitPictureInPicture === "function" && !video.disablePictureInPicture);
    }

    function isKeyboardShortcutsEnabled() {
        return keyboardShortcutsEnabled;
    }

    function isTouchGesturesEnabled() {
        return touchGesturesEnabled;
    }

    function isPersistSettingsEnabled() {
        return persistSettings;
    }

    function getSavedWatchTime() {
        const progress = getSavedWatchProgress();
        const savedTime = progress ? Number(progress.currentTime) : 0;
        return Number.isFinite(savedTime) && savedTime >= 0 ? savedTime : 0;
    }

    function getWatchProgressState(currentTime: number, duration: number) {
        const safeSavedTime = getSavedWatchTime();

        return {
            enabled: watchProgress,
            restored: watchProgressRestored,
            savedTime: safeSavedTime,
            savedTimeFormatted: formatTime(safeSavedTime),
            watchedPercent: duration ? Math.max(0, Math.min(currentTime / duration * 100, 100)) : 0
        };
    }

    // endregion

    // region ===== Sources ============================================================================================
    function load(): boolean {
        if (destroyed) return false;

        // Clear transient media state
        setBuffering(false);
        stateChanged ||= abLoopStart !== 0 || abLoopEnd !== 0 || watchProgressRestored;
        abLoopStart = 0;
        abLoopEnd = 0;
        previewThumbnailItems = [];
        watchProgressRestored = false;
        lastWatchProgressSaveTime = 0;

        video.load();

        loadPreviewThumbnails();

        notify();
        return true;
    }

    function applySources(sources: VideoSource[]) {
        video.pause();
        if (destroyed) return false;
        video.removeAttribute("src");

        video.querySelectorAll("source").forEach(function (source) {
            source.remove();
        });

        const firstTrack = video.querySelector("track");

        sources.forEach(function (source: VideoSource) {
            const sourceElement = ownerDocument.createElement("source");
            sourceElement.src = source.src;

            if (source.type) {
                sourceElement.type = source.type;
            }

            video.insertBefore(sourceElement, firstTrack);
        });

        return load();
    }

    function setSources(nextSources: VideoSource[]): boolean {
        if (destroyed) return false;

        validateSources(nextSources);
        const playbackRate = getPlaybackRate();
        const rateRevision = playbackRateRevision;
        const loaded = applySources(nextSources);
        if (destroyed) return false;

        if (rateRevision === playbackRateRevision && getPlaybackRate() !== playbackRate) {
            video.playbackRate = playbackRate;
        }

        applyMediaSession();
        notify();
        return loaded;
    }

    // endregion

    // region ===== Playback Controls ==================================================================================
    let buffering = false;

    function setBuffering(enabled: boolean) {
        if (buffering === enabled) return;
        buffering = enabled;
        stateChanged = true;
    }

    function setCurrentTime(time: number) {
        const nextTime = clampSeekTime(time);
        if (getCurrentTime() === nextTime) return false;

        video.currentTime = nextTime;

        return true;
    }

    async function play(): Promise<boolean> {
        if (destroyed) return false;
        if (isPlaying()) return true;

        try {
            await video.play();
        } catch (error) {
            if (destroyed) return false;
            if (error && (error as {name?: unknown}).name === "AbortError") return false; // superseded by a competing load — not a failure worth reporting

            reportMediaError(error);
            return false;
        }

        if (destroyed) return false;

        clearPoster();
        notify();
        return true;
    }

    function pause(): boolean {
        if (destroyed) return false;
        if (video.paused) return true;

        video.pause();
        notify();
        return true;
    }

    function stop(): boolean {
        if (destroyed) return false;

        const wasPlaying = isPlaying();
        const changed = setCurrentTime(0);

        if (wasPlaying) video.pause();
        if (wasPlaying || changed) notify();

        return true;
    }

    async function retry(): Promise<boolean> {
        if (destroyed) return false;

        video.load();
        return play();
    }

    function seek(value: number): boolean {
        if (destroyed) return false;

        const time = parseSeekTime(value);
        const changed = setCurrentTime(time);

        if (changed) notify();

        return changed;
    }

    function seekForward(seconds: number = 10): boolean {
        if (destroyed) return false;

        const changed = setCurrentTime(getCurrentTime() + parseSeekStep(seconds));

        if (changed) notify();

        return changed;
    }

    function seekBackward(seconds: number = 10): boolean {
        if (destroyed) return false;

        const changed = setCurrentTime(getCurrentTime() - parseSeekStep(seconds));

        if (changed) notify();

        return changed;
    }

    function seekToPercent(value: number): boolean {
        if (destroyed) return false;

        const percent = parseSeekPercent(value);
        const changed = setCurrentTime(getSeekTimeAtPercent(percent));

        if (changed) notify();

        return changed;
    }

    function parseSeekTime(value: number) {
        const time = Number(value);

        if (!Number.isFinite(time) || time < 0) {
            throw new TypeError("createVideo: seek time must be a non-negative number of seconds.");
        }

        return time;
    }

    function parseSeekStep(seconds: number) {
        const offset = Number(seconds);

        if (!Number.isFinite(offset) || offset <= 0) {
            throw new TypeError("createVideo: the seek offset must be a positive number of seconds.");
        }

        return offset;
    }

    function parseSeekPercent(value: number) {
        const percent = Number(value);

        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
            throw new TypeError("createVideo: the seek percent must be a number from 0 to 100.");
        }

        return percent;
    }

    function getSeekTimeAtPercent(value: number): number {
        const percent = parseSeekPercent(value);
        if (isLive()) return getCurrentTime(); // live has no fixed length, so percent maps to no move

        return getDuration() * percent / 100;
    }

    function getSeekPreviewAtPercent(value: number): {
        percent: number;
        time: number;
        timeFormatted: string;
        remainingTime: number;
        remainingTimeFormatted: string;
        thumbnail: unknown;
    } {
        const percent = parseSeekPercent(value);
        const time = getSeekTimeAtPercent(percent);
        const duration = getDuration();
        const remainingTime = getRemainingTime(time, duration);

        return {
            percent: percent,
            time: time,
            timeFormatted: formatTime(time),
            remainingTime: remainingTime,
            remainingTimeFormatted: `-${formatTime(remainingTime)}`,
            thumbnail: getPreviewThumbnail(time)
        };
    }

    function getSeekPreviewAtPosition(position: number, width: number): {
        percent: number;
        time: number;
        timeFormatted: string;
        remainingTime: number;
        remainingTimeFormatted: string;
        thumbnail: unknown;
    } {
        const seekPosition = Number(position);
        const seekWidth = Number(width);

        if (!Number.isFinite(seekPosition)) {
            throw new TypeError("createVideo: the seek preview position must be a finite number.");
        }

        if (!Number.isFinite(seekWidth) || seekWidth <= 0) {
            throw new TypeError("createVideo: the seek preview width must be a positive number.");
        }

        return getSeekPreviewAtPercent(Math.max(0, Math.min(seekPosition / seekWidth * 100, 100)));
    }

    function clampSeekTime(time: number) {
        const duration = getDuration();
        if (!duration) return Math.max(0, time); // duration unknown — only the lower bound is knowable

        return Math.max(0, Math.min(time, duration)); // relative seeks can overshoot either end; hold the target inside [0, duration]
    }

    // endregion

    // region ===== Playback Rate Controls =============================================================================
    const minimumPlaybackRate = 0.5;
    const maximumPlaybackRate = 2;
    let playbackRateRevision = 0;

    function setPlaybackRate(value: number): boolean {
        if (destroyed) return false;

        const rate = Number(value);

        if (!Number.isFinite(rate) || rate < minimumPlaybackRate || rate > maximumPlaybackRate) {
            throw new TypeError(`createVideo: playback rate must be a number from ${minimumPlaybackRate} to ${maximumPlaybackRate}.`);
        }

        playbackRateRevision++; // a reentrant explicit choice owns the rate, even if native load already reset it there
        if (getPlaybackRate() === rate) return false;

        video.playbackRate = rate;
        savePersistedSettings();
        notify();
        return true;
    }

    function increasePlaybackRate(step: number = 0.05): boolean {
        if (destroyed) return false;

        const amount = Number(step);

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new TypeError("createVideo: playback rate step must be a positive number.");
        }

        return setPlaybackRate(Math.min(getPlaybackRate() + amount, maximumPlaybackRate));
    }

    function decreasePlaybackRate(step: number = 0.05): boolean {
        if (destroyed) return false;

        const amount = Number(step);

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new TypeError("createVideo: playback rate step must be a positive number.");
        }

        return setPlaybackRate(Math.max(getPlaybackRate() - amount, minimumPlaybackRate));
    }

    function resetPlaybackRate(): boolean {
        if (destroyed) return false;

        return setPlaybackRate(1);
    }

    // endregion

    // region ===== Loop Controls ======================================================================================
    function setLoop(enabled: boolean): boolean {
        if (destroyed) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createVideo: loop must be a boolean.");
        }

        if (isLoopEnabled() === enabled) return true;

        video.loop = enabled;
        savePersistedSettings();
        notify();
        return true;
    }

    function applyLoop() {
        video.loop = loop;
    }

    function toggleLoop(): boolean {
        if (destroyed) return false;

        return setLoop(!isLoopEnabled());
    }

    // endregion

    // region ===== AB Loop Controls ===================================================================================
    let abLoopStart = 0;
    let abLoopEnd = 0;

    function setAbLoopStart(value: number = getCurrentTime()): boolean {
        if (destroyed) return false;

        const time = parseAbLoopTime(value);
        if (getAbLoopStart() === time) return true;

        abLoopStart = time;
        stateChanged = true;

        if (getAbLoopEnd() && getAbLoopEnd() <= getAbLoopStart()) {
            abLoopEnd = 0;
        }

        notify();
        return true;
    }

    function setAbLoopEnd(value: number = getCurrentTime()): boolean {
        if (destroyed) return false;

        const time = parseAbLoopTime(value);
        if (time <= getAbLoopStart()) return false;
        if (getAbLoopEnd() === time) return true;

        abLoopEnd = time;
        stateChanged = true;
        notify();
        return true;
    }

    function clearAbLoop(): boolean {
        if (destroyed) return false;
        if (!getAbLoopStart() && !getAbLoopEnd()) return true;

        abLoopStart = 0;
        abLoopEnd = 0;
        stateChanged = true;
        notify();
        return true;
    }

    function syncAbLoop() {
        if (!isAbLoopReady()) return false;
        if (getCurrentTime() < getAbLoopEnd()) return false;

        setCurrentTime(getAbLoopStart());
        notify();
        return true;
    }

    function parseAbLoopTime(value: number) {
        const time = Number(value);

        if (!Number.isFinite(time) || time < 0) {
            throw new TypeError("createVideo: AB loop time must be a non-negative number of seconds.");
        }

        return clampSeekTime(time);
    }

    // endregion

    // region ===== Volume Controls ====================================================================================
    function setVolume(value: number): boolean {
        if (destroyed) return false;

        const volume = parseVolume(value);
        let changed = video.volume !== volume;

        if (changed) video.volume = volume;

        // Raising the volume above zero implies intent to hear audio, so clear any mute to match.
        if (volume > 0 && isMuted()) {
            video.muted = false;
            changed = true;
        }

        if (changed) {
            savePersistedSettings();
            notify();
        }

        return changed;
    }

    function increaseVolume(step: number = 0.05): boolean {
        if (destroyed) return false;

        const volumeStep = parseVolume(step);
        if (volumeStep === 0) return false;

        return setVolume(Math.min(getVolume() + volumeStep, 1));
    }

    function decreaseVolume(step: number = 0.05): boolean {
        if (destroyed) return false;

        const volumeStep = parseVolume(step);
        if (volumeStep === 0) return false;

        return setVolume(Math.max(getVolume() - volumeStep, 0));
    }

    function setMuted(enabled: boolean): boolean {
        if (destroyed) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createVideo: muted must be a boolean.");
        }

        if (isMuted() === enabled) return true;

        video.muted = enabled;
        savePersistedSettings();
        notify();
        return true;
    }

    function toggleMuted(): boolean {
        if (destroyed) return false;

        return setMuted(!isMuted());
    }

    function parseVolume(value: number) {
        const volume = Number(value);

        if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
            throw new TypeError("createVideo: volume must be a number from 0 to 1.");
        }

        return volume;
    }

    function formatVolume(value: number) {
        return `${Math.round(value * 100)}%`;
    }

    // endregion

    // region ===== Autoplay Controls ==================================================================================
    let autoplayEnabled = autoplay;
    let autoplayAttempted = false;
    let autoplayBlocked = false;
    let autoplayAttempt = 0;

    async function setAutoplay(enabled: boolean): Promise<boolean> {
        if (destroyed) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createVideo: autoplay must be a boolean.");
        }

        if (!enabled) {
            autoplayAttempt++; // stale completions cannot re-block disabled autoplay
            if (!isAutoplayEnabled() && !isAutoplayBlocked()) return true;

            autoplayEnabled = false;
            autoplayBlocked = false;
            stateChanged = true;
            savePersistedSettings();
            notify();
            return true;
        }

        if (!autoplayEnabled) stateChanged = true;
        autoplayEnabled = true;
        savePersistedSettings();
        return startAutoplay();
    }

    async function startAutoplay() {
        if (destroyed) return false;

        const attempt = ++autoplayAttempt;
        stateChanged ||= !autoplayAttempted || autoplayBlocked;
        autoplayAttempted = true;
        autoplayBlocked = false;

        if (autoplayMuted) {
            video.muted = true;
        }

        video.playsInline = true; // mobile browsers usually require inline muted playback before autoplay is allowed
        notify();
        if (destroyed || attempt !== autoplayAttempt) return false;

        try {
            await video.play();
        } catch (error) {
            if (destroyed || attempt !== autoplayAttempt) return false;
            if (error && (error as {name?: unknown}).name === "AbortError") return false; // superseded by a competing load — not an autoplay policy block

            if (!autoplayBlocked) stateChanged = true;
            autoplayBlocked = true;
            notify();
            return false;
        }

        if (destroyed || attempt !== autoplayAttempt) return false;

        notify();
        return true;
    }

    // endregion

    // region ===== Poster Controls ====================================================================================
    function applyPoster() {
        if (poster) video.poster = poster;
    }

    function clearPoster() {
        if (!getPoster()) return false;

        video.removeAttribute("poster");
        return true;
    }

    // endregion

    // region ===== Captions ===========================================================================================
    let selectedCaption: VideoCaption | VideoCaptionTrackState | null = captions.find(caption => caption.default) || null; // a track marked `default` seeds captions on; persisted settings applied later override this
    let captionTrackElements: HTMLTrackElement[] = [];

    function setCaption(caption: VideoCaptionTrackState | null): boolean {
        if (destroyed) return false;

        const currentSrc = selectedCaption ? selectedCaption.src : null;
        const nextSrc = caption ? caption.src : null;
        if (currentSrc === nextSrc) return true;

        selectedCaption = caption ? {...caption} : null;
        stateChanged = true;
        syncCaptionTracks();
        savePersistedSettings();
        notify();
        return true;
    }

    function applyCaptions() {
        captionTrackElements = captions.map(function (caption) {
            const track = ownerDocument.createElement("track");
            if (caption.kind) track.kind = caption.kind;
            track.src = caption.src;
            track.srclang = caption.language;
            track.label = caption.label;
            track.default = caption.default ?? false;

            registerEventListener(track, "load", function () {
                syncCaptionTracks();
                notify();
            });
            registerEventListener(track, "error", function () {
                reportError("caption-load-failed", `The ${caption.label} captions could not be loaded.`);
            });

            video.appendChild(track);

            cleanups.push(function () {
                if (track.parentNode === video) {
                    video.removeChild(track);
                }
            });

            return track;
        });

        syncCaptionTracks();
    }

    function syncCaptionTracks() {
        captionTrackElements.forEach(function (track, index) {
            if (!track.track) return;

            // Compare against captions' own src, not track.src — the DOM resolves that to an
            // absolute URL, which would never match the consumer's original (often relative) string.
            track.track.mode = selectedCaption !== null && captions[index].src === selectedCaption.src
                ? "showing"
                : "disabled";
        });
    }

    // endregion

    // region ===== Preview Thumbnails =================================================================================
    let previewThumbnailItems: ReturnType<typeof parsePreviewThumbnailVtt> = [];
    let previewThumbnailRequest = 0;

    async function loadPreviewThumbnails() {
        if (!thumbnails || destroyed) return false;

        const request = ++previewThumbnailRequest;
        try {
            const response = await ownerDocument.defaultView!.fetch(thumbnails);
            if (destroyed || request !== previewThumbnailRequest) return false;
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const text = await response.text();
            if (destroyed || request !== previewThumbnailRequest) return false;
            previewThumbnailItems = parsePreviewThumbnailVtt(text, thumbnails);
            notify();
            return true;
        } catch {
            if (destroyed || request !== previewThumbnailRequest) return false;
            reportError("preview-thumbnails-load-failed", "Preview thumbnails could not be loaded.");
            return false;
        }
    }

    function getPreviewThumbnail(time: number) {
        if (destroyed || !previewThumbnailItems.length) return null;

        const thumbnail = previewThumbnailItems.find(function (item) {
            return time >= item.start && time < item.end;
        }) || previewThumbnailItems[previewThumbnailItems.length - 1];

        const scale = thumbnailScale;

        return {
            src: thumbnail.src,
            x: thumbnail.x,
            y: thumbnail.y,
            width: thumbnail.width,
            height: thumbnail.height,
            style: {
                backgroundImage: `url(${thumbnail.src})`,
                backgroundPosition: `${-thumbnail.x * scale}px ${-thumbnail.y * scale}px`,
                backgroundSize: `${thumbnail.width * 10 * scale}px ${thumbnail.height * 10 * scale}px`,
                width: `${thumbnail.width * scale}px`,
                height: `${thumbnail.height * scale}px`
            }
        };
    }

    function parsePreviewThumbnailVtt(text: string, source: string) {
        const lines = text.split(/\r?\n/);
        const thumbnails = [];

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index].trim();
            if (!line.includes("-->")) continue;

            const [startText, endText] = line.split("-->").map(function (part: string) {
                return part.trim();
            });
            const thumbnailText = findNextVttPayloadLine(lines, index + 1);
            if (!thumbnailText) continue;

            const parsedThumbnail = parsePreviewThumbnailPayload(thumbnailText, source);
            if (!parsedThumbnail) continue;

            thumbnails.push({
                start: parseVttTime(startText),
                end: parseVttTime(endText),
                src: parsedThumbnail.src,
                x: parsedThumbnail.x,
                y: parsedThumbnail.y,
                width: parsedThumbnail.width,
                height: parsedThumbnail.height
            });
        }

        return thumbnails;
    }

    function findNextVttPayloadLine(lines: string[], index: number) {
        const line = index < lines.length ? lines[index].trim() : "";
        if (!line || line.includes("-->")) return ""; // blank or a new cue: this cue has no payload

        return line;
    }

    function parsePreviewThumbnailPayload(value: string, source: string) {
        const match = value.match(/^(.+)#xywh=(\d+),(\d+),(\d+),(\d+)$/);
        if (!match) return null;

        return {
            src: resolvePreviewThumbnailUrl(match[1], source),
            x: Number(match[2]),
            y: Number(match[3]),
            width: Number(match[4]),
            height: Number(match[5])
        };
    }

    function resolvePreviewThumbnailUrl(value: string, source: string) {
        try {
            return new URL(value, new URL(source, ownerDocument.baseURI)).toString();
        } catch {
            return value;
        }
    }

    function parseVttTime(value: string) {
        const parts = value.split(":");
        const seconds = Number(parts.pop());
        const minutes = Number(parts.pop() || 0);
        const hours = Number(parts.pop() || 0);

        return hours * 3600 + minutes * 60 + seconds;
    }

    // endregion

    // region ===== Fullscreen Controls ================================================================================
    async function enterFullscreen(): Promise<boolean> {
        if (destroyed) return false;
        if (!isFullscreenSupported()) return false;
        if (isFullscreenActive()) return true;

        try {
            if (playerContainer.requestFullscreen) {
                await playerContainer.requestFullscreen();
            } else if (playerContainer.webkitRequestFullscreen) {
                await playerContainer.webkitRequestFullscreen();
            } else if (video.webkitEnterFullscreen) {
                video.webkitEnterFullscreen();
            } else {
                return false;
            }
        } catch {
            return false;
        }

        if (destroyed) return false;

        notify();
        return true;
    }

    async function exitFullscreen(): Promise<boolean> {
        if (destroyed) return false;
        if (!isFullscreenActive()) return true;

        try {
            if (ownerDocument.exitFullscreen) {
                await ownerDocument.exitFullscreen();
            } else if (ownerDocument.webkitExitFullscreen) {
                await ownerDocument.webkitExitFullscreen();
            } else if (video.webkitExitFullscreen) {
                video.webkitExitFullscreen();
            } else {
                return false;
            }
        } catch {
            return false;
        }

        if (destroyed) return false;

        notify();
        return true;
    }

    function getFullscreenElement() {
        return ownerDocument.fullscreenElement || ownerDocument.webkitFullscreenElement || null;
    }

    // endregion

    // region ===== Picture-in-Picture Controls ========================================================================
    async function enterPictureInPicture(): Promise<boolean> {
        if (destroyed) return false;
        if (!isPictureInPictureSupported()) return false;
        if (isPictureInPictureActive()) return true;

        try {
            await video.requestPictureInPicture();
        } catch {
            return false;
        }

        if (destroyed) return false;

        notify();
        return true;
    }

    async function exitPictureInPicture(): Promise<boolean> {
        if (destroyed) return false;
        if (!isPictureInPictureActive()) return true; // this video isn't the one in PiP — leave any other element's PiP alone

        try {
            await ownerDocument.exitPictureInPicture();
        } catch {
            return false;
        }

        if (destroyed) return false;

        notify();
        return true;
    }

    // endregion

    // region ===== Keyboard Shortcuts =================================================================================
    let keyboardShortcutsEnabled = keyboardShortcuts;

    function setKeyboardShortcuts(enabled: boolean): boolean {
        if (destroyed) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createVideo: keyboard shortcuts must be a boolean.");
        }

        if (isKeyboardShortcutsEnabled() === enabled) return true;

        keyboardShortcutsEnabled = enabled;
        stateChanged = true;
        notify();
        return true;
    }

    function listKeyboardShortcuts(): Array<{id: string; keys: string[]; message: string}> {
        return [
            {id: "toggle-play", keys: ["Space"], message: "Play or pause"},
            {id: "seek-backward", keys: ["ArrowLeft"], message: `Seek backward ${keyboardSeekStep} seconds`},
            {id: "seek-forward", keys: ["ArrowRight"], message: `Seek forward ${keyboardSeekStep} seconds`},
            {id: "increase-volume", keys: ["ArrowUp"], message: "Increase volume"},
            {id: "decrease-volume", keys: ["ArrowDown"], message: "Decrease volume"},
            {id: "toggle-mute", keys: ["M"], message: "Mute or unmute"},
            {id: "toggle-fullscreen", keys: ["F"], message: "Enter or exit fullscreen"},
            {id: "seek-to-start", keys: ["0", "Home"], message: "Jump to the start"},
            {
                id: "seek-to-percent",
                keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
                message: "Jump to 10%–90% of the video"
            },
            {id: "seek-to-end", keys: ["End"], message: "Jump to the end"}
        ];
    }

    function handleKeyboardShortcut(event: KeyboardEvent) {
        if (destroyed || !isKeyboardShortcutsEnabled()) return;
        if (shouldIgnoreKeyboardShortcut(event)) return;

        if (event.key === " " || event.key === "Spacebar") {
            togglePlayback();
            event.preventDefault();
            return;
        }

        if (event.key === "ArrowLeft") {
            seekBackward(keyboardSeekStep);
            event.preventDefault();
            return;
        }

        if (event.key === "ArrowRight") {
            seekForward(keyboardSeekStep);
            event.preventDefault();
            return;
        }

        if (event.key === "ArrowUp") {
            increaseVolume(keyboardVolumeStep);
            event.preventDefault();
            return;
        }

        if (event.key === "ArrowDown") {
            decreaseVolume(keyboardVolumeStep);
            event.preventDefault();
            return;
        }

        if (event.key.toLowerCase() === "m") {
            setMuted(!isMuted());
            event.preventDefault();
            return;
        }

        if (event.key.toLowerCase() === "f") {
            toggleFullscreen();
            event.preventDefault();
            return;
        }

        if (event.key === "0" || event.key === "Home") {
            seek(0);
            event.preventDefault();
            return;
        }

        if (event.key >= "1" && event.key <= "9") {
            seekToPercent(Number(event.key) * 10);
            event.preventDefault();
            return;
        }

        if (event.key === "End") {
            seek(getDuration());
            event.preventDefault();
        }
    }

    function shouldIgnoreKeyboardShortcut(event: KeyboardEvent) {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true;

        const target = event.target as HTMLElement | null;
        if (!target || target === playerContainer || target === video) return false;
        if (target.isContentEditable) return true;

        return ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
    }

    // endregion

    // region ===== Pointer Events =====================================================================================
    const doubleTapDelay = 300;
    let touchGesturesEnabled = touchGestures;
    let lastTouchTap: {time: number;} | null = null;
    let lastMouseClickTime = 0;
    let touchTapTimer: ReturnType<typeof setTimeout> | null = null;

    function setTouchGestures(enabled: boolean): boolean {
        if (destroyed) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createVideo: touch gestures must be a boolean.");
        }

        if (isTouchGesturesEnabled() === enabled) return true;

        touchGesturesEnabled = enabled;
        stateChanged = true;

        if (!enabled) clearTouchTap();

        notify();
        return true;
    }

    function handlePointerEvent(event: PointerEvent) {
        if (destroyed) return;
        if (shouldIgnorePointerEvent(event)) return;

        const tap = getPointerTap(event);
        if (!tap) return;

        // Mouse clicks are always-on baseline behavior; the touchGestures flag gates only the finger idioms.
        if (event.pointerType === "mouse") {
            handleMouseClick(tap);
            return;
        }

        if (!isTouchGesturesEnabled()) return;

        handleTouchTap(tap);
    }

    function handleMouseClick(tap: VideoTap) {
        if (lastMouseClickTime && tap.time - lastMouseClickTime <= doubleTapDelay) {
            lastMouseClickTime = 0;

            if (onDoubleClick) return callConsumer(onDoubleClick, tap);

            togglePlayback(); // undo the first click's toggle so a double-click leaves playback as it started
            if (destroyed) return;
            toggleFullscreen();
            return;
        }

        lastMouseClickTime = tap.time;

        if (onSingleClick) return callConsumer(onSingleClick, tap);

        togglePlayback(); // instant — a desktop click shouldn't wait out the double-click window
    }

    function clearTouchTap() {
        if (touchTapTimer !== null) clearTimeout(touchTapTimer);
        touchTapTimer = null;
        lastTouchTap = null;
    }

    function handleTouchTap(tap: VideoTap) {
        if (lastTouchTap && tap.time - lastTouchTap.time <= doubleTapDelay) {
            clearTouchTap();

            if (onDoubleTap) return callConsumer(onDoubleTap, tap);

            // Double tap: the outer thirds seek, the center third toggles fullscreen.
            if (tap.zone === "left") return void seekBackward();
            if (tap.zone === "right") return void seekForward();

            toggleFullscreen();
            return;
        }

        clearTouchTap();
        lastTouchTap = tap;

        touchTapTimer = setTimeout(function () {
            if (!lastTouchTap || lastTouchTap !== tap || destroyed || !isTouchGesturesEnabled()) return;

            touchTapTimer = null;
            lastTouchTap = null;

            if (onSingleTap) return callConsumer(onSingleTap, tap);

            togglePlayback(); // single tap toggles playback once the double-tap window expires
        }, doubleTapDelay);
    }

    function togglePlayback(): void {
        if (isPlaying()) {
            pause();
        } else {
            void play();
        }
    }

    function toggleFullscreen() {
        if (isFullscreenActive()) {
            void exitFullscreen();
        } else {
            void enterFullscreen();
        }
    }

    function getPointerTap(event: {clientX: number;}) {
        const rect = playerContainer.getBoundingClientRect ? playerContainer.getBoundingClientRect() : null;
        if (!rect) return null;

        const x = event.clientX - rect.left;

        return {
            x: x,
            width: rect.width,
            zone: x < rect.width / 3 ? "left" : x > rect.width * 2 / 3 ? "right" : "center", // thirds, the universal double-tap seek zones
            time: Date.now()
        };
    }

    function shouldIgnorePointerEvent(event: PointerEvent) {
        if (event.defaultPrevented || (event.pointerType === "mouse" && event.button !== 0)) return true;

        const target = event.target as HTMLElement | null;
        if (!target || target === playerContainer || target === video) return false;
        if (target.isContentEditable) return true;

        // A tap can land on an icon or label nested inside a control, not the control itself —
        // closest() catches those, unlike a direct tagName check.
        return Boolean(
            target.closest
            && target.closest("input, textarea, select, button, a, [role='slider'], [data-slot='slider'], [data-slot='sheet-content'], [data-slot='sheet-overlay'], [data-video-controls-bar]")
        );
    }

    // endregion

    // region ===== Media Session ======================================================================================
    function getMediaSessionState() {
        const enabled = mediaSessionMetadata !== undefined && mediaSessionMetadata !== null;

        return {
            enabled: enabled,
            active: enabled && isMediaSessionSupported(),
            title: mediaSessionMetadata && mediaSessionMetadata.title ? mediaSessionMetadata.title : "",
            artist: mediaSessionMetadata && mediaSessionMetadata.artist ? mediaSessionMetadata.artist : "",
            album: mediaSessionMetadata && mediaSessionMetadata.album ? mediaSessionMetadata.album : "",
            artwork: mediaSessionMetadata && mediaSessionMetadata.artwork ? mediaSessionMetadata.artwork : []
        };
    }

    function isMediaSessionSupported() {
        return Boolean(browserNavigator && browserNavigator!.mediaSession);
    }

    function applyMediaSession() {
        const mediaSessionState = getMediaSessionState();
        if (!mediaSessionState.enabled || !mediaSessionState.active) return false;

        applyMediaSessionMetadata();
        applyMediaSessionActionHandlers();
        syncMediaSessionState(getState());
        return true;
    }

    function setMediaSession(nextMediaSession: VideoMediaSession): boolean {
        if (destroyed) return false;

        validateMediaSession(nextMediaSession);
        mediaSessionMetadata = nextMediaSession;

        if (!getMediaSessionState().enabled) {
            clearMediaSessionState();
            return true;
        }

        applyMediaSession();
        return true;
    }

    function applyMediaSessionMetadata() {
        if (!isMediaSessionSupported()) return false;

        const mediaSessionState = getMediaSessionState();
        const metadata = {
            title: mediaSessionState.title,
            artist: mediaSessionState.artist,
            album: mediaSessionState.album,
            artwork: mediaSessionState.artwork
        };

        try {
            if (typeof ownerDocument.defaultView!.MediaMetadata === "function") {
                browserNavigator!.mediaSession.metadata = new ownerDocument.defaultView!.MediaMetadata(metadata);
            } else {
                browserNavigator!.mediaSession.metadata = metadata;
            }

            return true;
        } catch {
            return false;
        }
    }

    function applyMediaSessionActionHandlers() {
        if (!isMediaSessionSupported() || typeof browserNavigator!.mediaSession.setActionHandler !== "function") return false;

        const handlers: Partial<Record<MediaSessionAction, MediaSessionActionHandler>> = {
            play: function () {
                void play();
            },
            pause: function () {
                pause();
            },
            stop: function () {
                stop();
            },
            seekbackward: function (details: MediaSessionActionDetails) {
                seekBackward(details && details.seekOffset ? details.seekOffset : 10);
            },
            seekforward: function (details: MediaSessionActionDetails) {
                seekForward(details && details.seekOffset ? details.seekOffset : 10);
            },
            seekto: function (details) {
                if (destroyed || !details || !Number.isFinite(Number(details.seekTime))) return;

                if (details.fastSeek && typeof video.fastSeek === "function") {
                    video.fastSeek(Number(details.seekTime));
                    notify();
                    return;
                }

                seek(details.seekTime!);
            }
        };

        (Object.keys(handlers) as MediaSessionAction[]).forEach(function (action) {
            try {
                browserNavigator!.mediaSession.setActionHandler(action, handlers[action]!);
            } catch {
            }
        });

        return true;
    }

    function syncMediaSessionState(state: VideoState) {
        const mediaSessionState = getMediaSessionState();
        if (!mediaSessionState.enabled || !mediaSessionState.active) return false;

        // Sync the browser-level playback indicator.
        try {
            browserNavigator!.mediaSession.playbackState = state.playing ? "playing" : "paused";
        } catch {
        }

        if (typeof browserNavigator!.mediaSession.setPositionState !== "function") return true;
        if (!Number.isFinite(state.duration) || state.duration <= 0 || state.live) return true;

        // Sync lock-screen seek position when the media has a fixed duration.
        try {
            browserNavigator!.mediaSession.setPositionState({
                duration: state.duration,
                playbackRate: state.playbackRate,
                position: Math.min(state.currentTime, state.duration)
            });
        } catch {
        }

        return true;
    }

    function clearMediaSessionState() {
        if (isMediaSessionSupported()) {
            try {
                browserNavigator!.mediaSession.metadata = null;
                browserNavigator!.mediaSession.playbackState = "none";
            } catch {
            }

            // Clear browser media-session action handlers during teardown.
            if (typeof browserNavigator!.mediaSession.setActionHandler === "function") {
                (["play", "pause", "stop", "seekbackward", "seekforward", "seekto"] as const).forEach(function (action) {
                    try {
                        browserNavigator!.mediaSession.setActionHandler(action, null);
                    } catch {
                    }
                });
            }
        }
    }

    // endregion

    // region ===== Persisted Settings =================================================================================
    const persistSettingsKey = "strata-settings";

    function getPersistedSettings() {
        if (!isPersistSettingsEnabled()) return null;

        const storage = getLocalStorage(video);
        if (!storage) return null;

        try {
            const storedSettings = storage.getItem(persistSettingsKey);
            if (!storedSettings) return null;

            const settings = JSON.parse(storedSettings);
            if (!settings || typeof settings !== "object") return null;

            return settings;
        } catch {
            return null;
        }
    }

    function savePersistedSettings() {
        if (!isPersistSettingsEnabled()) return false;

        const storage = getLocalStorage(video);
        if (!storage) return false;

        try {
            storage.setItem(persistSettingsKey, JSON.stringify({
                volume: getVolume(),
                muted: isMuted(),
                playbackRate: getPlaybackRate(),
                autoplay: isAutoplayEnabled(),
                loop: isLoopEnabled(),
                selectedCaption: selectedCaption
            }));
        } catch {
            return false;
        }

        return true;
    }

    function applyPersistedSettings() {
        const settings = getPersistedSettings();
        if (!settings) return false;

        // Apply persisted volume.
        const volume = Number(settings.volume);

        if (Number.isFinite(volume) && volume >= 0 && volume <= 1 && video.volume !== volume) {
            video.volume = volume;
        }

        // Apply persisted muted state.
        if (typeof settings.muted === "boolean" && isMuted() !== settings.muted) {
            video.muted = settings.muted;
        }

        // Apply persisted playback rate.
        const playbackRate = Number(settings.playbackRate);

        if (Number.isFinite(playbackRate) && playbackRate >= minimumPlaybackRate && playbackRate <= maximumPlaybackRate && getPlaybackRate() !== playbackRate) {
            video.playbackRate = playbackRate;
        }

        // Apply persisted autoplay.
        if (typeof settings.autoplay === "boolean") {
            autoplayEnabled = settings.autoplay;
        }

        // Apply persisted loop.
        if (typeof settings.loop === "boolean") {
            video.loop = settings.loop;
        }

        // Resolve saved selection against the configured tracks; storage cannot supply current metadata.
        if (settings.selectedCaption === null) {
            selectedCaption = null;
        } else if (settings.selectedCaption && typeof settings.selectedCaption === "object"
            && !Array.isArray(settings.selectedCaption) && typeof settings.selectedCaption.src === "string") {
            selectedCaption = captions.find(function (caption) { return caption.src === settings.selectedCaption.src; }) || null;
        }

        return true;
    }

    function clearPersistedSettings(): boolean {
        if (destroyed) return false;
        if (!isPersistSettingsEnabled()) return false;

        const storage = getLocalStorage(video);
        if (!storage) return false;

        try {
            storage.removeItem(persistSettingsKey);
        } catch {
            return false;
        }

        return true;
    }

    // endregion

    // region ===== Watch Progress =====================================================================================
    let watchProgressRestored = false;
    let lastWatchProgressSaveTime = 0;

    function getWatchProgressKey() {
        return `video-watch-progress:${videoId}`;
    }

    function getSavedWatchProgress() {
        if (!watchProgress) return null;

        const storage = getLocalStorage(video);
        if (!storage) return null;

        try {
            const storedProgress = storage.getItem(getWatchProgressKey());
            if (!storedProgress) return null;

            const progress = JSON.parse(storedProgress);
            if (!progress || typeof progress !== "object") return null;

            return progress;
        } catch {
            return null;
        }
    }

    function saveWatchProgress(force = true) {
        if (!watchProgress) return false;

        // A snapshot without a source or duration is meaningless — refusing it also stops the browser's
        // unload-time `pause` event (fired against an already-emptied element) from clobbering a real save.
        if (!getSource() || !getDuration()) return false;

        const now = Date.now();
        if (!force && now - lastWatchProgressSaveTime < watchProgressSaveInterval) return false;

        const storage = getLocalStorage(video);
        if (!storage) return false;

        lastWatchProgressSaveTime = now;
        const currentTime = getCurrentTime();
        const duration = getDuration();

        try {
            storage.setItem(getWatchProgressKey(), JSON.stringify({
                currentTime: currentTime,
                duration: duration,
                watchedPercent: Math.max(0, Math.min(currentTime / duration * 100, 100)),
                source: getSource(),
                ended: video.ended,
                updatedAt: now
            }));
        } catch {
            return false;
        }

        return true;
    }

    function resumeWatchProgress(): boolean {
        if (destroyed || !watchProgress || watchProgressRestored) return false;

        watchProgressRestored = true;
        stateChanged = true;
        const progress = getSavedWatchProgress();
        if (!progress || progress.ended) {
            notify();
            return false;
        }

        const source = getSource();
        if (progress.source && source && progress.source !== source) {
            notify();
            return false;
        }

        const duration = getDuration();
        const time = Number(progress.currentTime);
        if (!Number.isFinite(time) || time <= 0) {
            notify();
            return false;
        }

        if (duration && time >= duration - 2) {
            notify();
            return false;
        }

        const changed = setCurrentTime(time);

        notify();

        return changed;
    }

    // endregion

    // region ===== Tear Down ==========================================================================================
    function destroy(): void {
        if (destroyed) return;
        destroyed = true; // external cleanup cannot re-enter a live engine
        notifier.destroy();
        clearTouchTap();
        previewThumbnailItems = [];

        saveWatchProgress(true);

        clearMediaSessionState();
        clearPoster();

        cleanups.forEach(function (cleanup) {
            cleanup();
        });

        cleanups.length = 0; // release references to the cleanup functions and their event targets
    }

    // endregion

    observedMedia = getMediaObservation();
    init();
    // Silent setup becomes the baseline; keep any published setup snapshot until its async work settles.
    if (!hasNotified) observedMedia = getMediaObservation();

    return {
        getState,
        subscribe,
        load,
        setSources,
        play,
        togglePlayback,
        pause,
        stop,
        seek,
        seekForward,
        seekBackward,
        seekToPercent,
        getSeekTimeAtPercent,
        getSeekPreviewAtPercent,
        getSeekPreviewAtPosition,
        setVolume,
        increaseVolume,
        decreaseVolume,
        setMuted,
        toggleMuted,
        setAutoplay,
        setLoop,
        toggleLoop,
        setMediaSession,
        setAbLoopStart,
        setAbLoopEnd,
        clearAbLoop,
        retry,
        clearPersistedSettings,
        setPlaybackRate,
        increasePlaybackRate,
        decreasePlaybackRate,
        resetPlaybackRate,
        setCaption,
        enterPictureInPicture,
        exitPictureInPicture,
        enterFullscreen,
        exitFullscreen,
        setKeyboardShortcuts,
        listKeyboardShortcuts,
        setTouchGestures,
        resumeWatchProgress,
        destroy
    };
}
