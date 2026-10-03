import SignalsmithStretchModule from 'strata-packages/ui-interactions/internal/vendor/signalsmith-stretch';
import {createErrorReporter, createNotifier} from 'strata-packages/ui-interactions/internal/core';

interface StretchNode extends AudioWorkletNode {
    schedule(options: {semitones: number; active?: boolean}): Promise<unknown>;
}
const SignalsmithStretch = SignalsmithStretchModule as (context: AudioContext, options?: AudioWorkletNodeOptions) => Promise<StretchNode>;

export type AudioSource = {
    src: string;
    type?: string;
};

export type AudioArtwork = {
    src: string;
    sizes?: string;
    type?: string;
};

export type AudioMediaSession = {
    title?: string;
    artist?: string;
    album?: string;
    artwork?: AudioArtwork[];
} | null;

export type AudioError = {
    id: string;
    message: string;
};

export type AudioState = {
    source: string;
    sources: AudioSource[];
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
    keyboardShortcuts: boolean;
    persistSettings: boolean;
    pitchShift: {
        supported: boolean;
        enabled: boolean;
        active: boolean;
        semitones: number;
    };
    watchProgress: {
        enabled: boolean;
        restored: boolean;
        savedTime: number;
        savedTimeFormatted: string;
        watchedPercent: number;
    };
};

export type AudioConfig = {
    onChange?: (state: AudioState) => void;
    onError?: (error: AudioError) => void;
    audioId?: string;
    playerContainer?: HTMLElement;
    autoplay?: boolean;
    loop?: boolean;
    sources?: AudioSource[];
    keyboardShortcuts?: boolean;
    keyboardSeekStep?: number;
    keyboardVolumeStep?: number;
    mediaSession?: AudioMediaSession;
    pitchShift?: boolean;
    watchProgress?: boolean;
    watchProgressSaveInterval?: number;
    persistSettings?: boolean;
};

export type AudioEngine = {
    getState: () => AudioState;
    subscribe: (listener: (state: AudioState) => void) => () => void;
    load: () => boolean;
    setSources: (sources: AudioSource[]) => boolean;
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
    };
    getSeekPreviewAtPosition: (position: number, width: number) => {
        percent: number;
        time: number;
        timeFormatted: string;
        remainingTime: number;
        remainingTimeFormatted: string;
    };
    setVolume: (volume: number) => boolean;
    increaseVolume: (step?: number) => boolean;
    decreaseVolume: (step?: number) => boolean;
    setMuted: (enabled: boolean) => boolean;
    toggleMuted: () => boolean;
    setAutoplay: (enabled: boolean) => Promise<boolean>;
    setLoop: (enabled: boolean) => boolean;
    toggleLoop: () => boolean;
    setMediaSession: (mediaSession: AudioMediaSession) => boolean;
    setAbLoopStart: (time?: number) => boolean;
    setAbLoopEnd: (time?: number) => boolean;
    clearAbLoop: () => boolean;
    retry: () => Promise<boolean>;
    clearPersistedSettings: () => boolean;
    setPlaybackRate: (rate: number) => boolean;
    increasePlaybackRate: (step?: number) => boolean;
    decreasePlaybackRate: (step?: number) => boolean;
    resetPlaybackRate: () => boolean;
    setPitch: (semitones: number) => Promise<boolean>;
    setKeyboardShortcuts: (enabled: boolean) => boolean;
    listKeyboardShortcuts: () => Array<{id: string; keys: string[]; message: string}>;
    resumeWatchProgress: () => boolean;
    destroy: () => void;
};

export function formatTime(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = Math.floor(safeSeconds % 60).toString().padStart(2, "0");

    return `${minutes}:${remainingSeconds}`;
}

function getLocalStorage(element: HTMLAudioElement) {
    try {
        return element.ownerDocument.defaultView!.localStorage;
    } catch {
        return null;
    }
}

export function createAudio(audio: HTMLAudioElement, config: AudioConfig = {}): AudioEngine {
    if (!audio || typeof audio.addEventListener !== "function" || typeof audio.play !== "function" || typeof audio.pause !== "function") {
        throw new TypeError("createAudio: 'audio' must be a media element.");
    }

    // region ===== Config =============================================================================================
    const {
        onChange, onError,
        audioId, playerContainer = audio,
        autoplay = false, loop = audio.loop,
        sources = [],
        keyboardShortcuts = true, keyboardSeekStep = 5, keyboardVolumeStep = 0.05,
        mediaSession,
        pitchShift = false,
        watchProgress = false, watchProgressSaveInterval = 1000, persistSettings = false
    } = config;

    let mediaSessionMetadata = mediaSession;

    validateConfig();

    function validateConfig() {

        // On Change
        if (onChange !== undefined && typeof onChange !== "function") {
            throw new TypeError("createAudio: the 'onChange' option must be a function when provided.");
        }

        // On Error
        if (onError !== undefined && typeof onError !== "function") {
            throw new TypeError("createAudio: the 'onError' option must be a function when provided.");
        }

        // Audio Id
        if (audioId !== undefined && typeof audioId !== "string") {
            throw new TypeError("createAudio: the 'audioId' option must be a string when provided.");
        }

        // Player Container — used as the target for keyboard shortcuts.
        if (!playerContainer || typeof playerContainer.addEventListener !== "function") {
            throw new TypeError("createAudio: the 'playerContainer' option must be a DOM element.");
        }

        // Autoplay
        if (typeof autoplay !== "boolean") {
            throw new TypeError("createAudio: the 'autoplay' option must be a boolean.");
        }

        // Loop
        if (typeof loop !== "boolean") {
            throw new TypeError("createAudio: the 'loop' option must be a boolean.");
        }

        // Sources
        validateSources(sources);

        // Keyboard Shortcuts
        if (typeof keyboardShortcuts !== "boolean") {
            throw new TypeError("createAudio: the 'keyboardShortcuts' option must be a boolean.");
        }

        // Keyboard Seek Step
        if (typeof keyboardSeekStep !== "number" || !Number.isFinite(keyboardSeekStep) || keyboardSeekStep <= 0) {
            throw new TypeError("createAudio: the 'keyboardSeekStep' option must be a positive number.");
        }

        // Keyboard Volume Step
        if (typeof keyboardVolumeStep !== "number" || !Number.isFinite(keyboardVolumeStep) || keyboardVolumeStep <= 0 || keyboardVolumeStep > 1) {
            throw new TypeError("createAudio: the 'keyboardVolumeStep' option must be greater than 0 and at most 1.");
        }

        // Media Session
        validateMediaSession(mediaSession);

        // Pitch Shift
        if (typeof pitchShift !== "boolean") {
            throw new TypeError("createAudio: the 'pitchShift' option must be a boolean.");
        }

        // Watch Progress
        if (typeof watchProgress !== "boolean") {
            throw new TypeError("createAudio: the 'watchProgress' option must be a boolean.");
        }

        // Watch Progress requires an audioId, since it scopes the saved position to this specific audio.
        if (watchProgress && (typeof audioId !== "string" || !audioId.trim())) {
            throw new TypeError("createAudio: the 'audioId' option must be a non-empty string when 'watchProgress' is true.");
        }

        // Watch Progress Save Interval
        if (typeof watchProgressSaveInterval !== "number" || !Number.isFinite(watchProgressSaveInterval) || watchProgressSaveInterval < 0) {
            throw new TypeError("createAudio: the 'watchProgressSaveInterval' option must be a non-negative number.");
        }

        // Persist Settings
        if (typeof persistSettings !== "boolean") {
            throw new TypeError("createAudio: the 'persistSettings' option must be a boolean.");
        }
    }

    function validateSources(value: AudioSource[]) {
        if (!Array.isArray(value)) {
            throw new TypeError("createAudio: sources must be an array.");
        }

        value.forEach(function (source) {
            if (!source || typeof source !== "object") {
                throw new TypeError("createAudio: each source must be an object.");
            }

            if (typeof source.src !== "string" || !source.src) {
                throw new TypeError("createAudio: each source must include a non-empty src.");
            }

            if (source.type !== undefined && typeof source.type !== "string") {
                throw new TypeError("createAudio: each source's type must be a string when provided.");
            }
        });
    }

    function validateMediaSession(value: AudioMediaSession | undefined) {
        if (value === undefined || value === null) return;

        if (typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError("createAudio: mediaSession must be a metadata object.");
        }

        (["title", "artist", "album"] as const).forEach(function (key) {
            if (value[key] !== undefined && typeof value[key] !== "string") {
                throw new TypeError(`createAudio: mediaSession.${key} must be a string when provided.`);
            }
        });

        if (value.artwork !== undefined && !Array.isArray(value.artwork)) {
            throw new TypeError("createAudio: mediaSession.artwork must be an array when provided.");
        }

        (value.artwork || []).forEach(function (item) {
            if (!item || typeof item !== "object" || Array.isArray(item)) {
                throw new TypeError("createAudio: mediaSession artwork items must be objects.");
            }

            if (typeof item.src !== "string" || !item.src) {
                throw new TypeError("createAudio: mediaSession artwork items must include a non-empty src.");
            }

            if (item.sizes !== undefined && typeof item.sizes !== "string") {
                throw new TypeError("createAudio: mediaSession artwork sizes must be a string when provided.");
            }

            if (item.type !== undefined && typeof item.type !== "string") {
                throw new TypeError("createAudio: mediaSession artwork type must be a string when provided.");
            }
        });
    }

    // endregion

    // region ===== Init ===============================================================================================
    const ownerDocument = audio.ownerDocument; // the audio's own document, so state reads work across realms/iframes
    const browserNavigator = ownerDocument.defaultView ? ownerDocument.defaultView!.navigator : null;
    let destroyed = false; // late media events must not still fire callbacks after teardown

    function init() {

        // Wire up — subscribers and event listeners first, so nothing that follows goes unheard
        if (onChange) subscribe(onChange); // register the onChange option as a subscriber

        registerAllEventListeners();

        // Load the media first — the native load() resets playbackRate, so it must run before preferences are restored
        if (sources.length) {
            applySources(sources);
        }

        // Apply config to the media element
        applyLoop();

        if (pitchShift) applyPreservesPitch(); // keep native speed pitch-neutral so speed and the pitch shifter stay orthogonal

        applyPersistedSettings(); // restore persisted preferences after config defaults
        applyMediaSession();

        // Go
        if (autoplayEnabled) {
            startAutoplay();
        }
    }

    // endregion

    // region ===== Event Listeners ====================================================================================
    const cleanups: (() => void)[] = []; // teardown functions, collected so everything can be undone at once

    function registerEventListener<K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, handler: (event: HTMLElementEventMap[K]) => void) {
        const guardedHandler = function (event: Event) {
            if (!destroyed) handler(event as HTMLElementEventMap[K]);
        };
        target.addEventListener(type, guardedHandler);

        cleanups.push(function () {
            target.removeEventListener(type, guardedHandler); // detach the exact listener that was registered
        });
    }

    function registerAllEventListeners() {

        // Playback State
        registerEventListener(audio, "play", function () {
            notify();
        });

        // AB Loop Controls / Watch Progress
        registerEventListener(audio, "timeupdate", function () {
            syncAbLoop();
            if (destroyed) return;
            saveWatchProgress(false);
            notify();
        });

        // Playback Controls
        registerEventListener(audio, "progress", function () {
            notify();
        });

        registerEventListener(audio, "durationchange", function () {
            notify();
        });

        registerEventListener(audio, "seeking", function () {
            notify();
        });

        // Watch Progress / State
        registerEventListener(audio, "seeked", function () {
            saveWatchProgress(true);
            notify();
        });

        registerEventListener(audio, "pause", function () {
            setBuffering(false);
            saveWatchProgress(true);
            notify();
        });

        registerEventListener(audio, "ended", function () {
            setBuffering(false);
            saveWatchProgress(true);
            notify();
        });

        registerEventListener(audio, "loadedmetadata", function () {
            notify();
        });

        // State
        registerEventListener(audio, "waiting", function () {
            setBuffering(true);
            notify();
        });

        registerEventListener(audio, "stalled", function () {
            setBuffering(true);
            notify();
        });

        registerEventListener(audio, "playing", function () {
            setBuffering(false);
            notify();
        });

        registerEventListener(audio, "canplay", function () {
            setBuffering(false);
            notify();
        });

        // Persisted Settings — no saves here: persistence rides the setters, so engine/browser-caused
        // changes (a native load() rate reset) never masquerade as user preference.
        registerEventListener(audio, "volumechange", function () {
            notify();
        });

        registerEventListener(audio, "ratechange", function () {
            notify();
        });

        // Keyboard Shortcuts
        registerEventListener(playerContainer, "keydown", function (event) {
            handleKeyboardShortcut(event);
        });

        // Error Handling
        registerEventListener(audio, "error", function () {
            reportMediaError();
        });

        // Pitch Shifter — once the element is tapped, a suspended context means silence, so resume on every play gesture
        registerEventListener(audio, "play", function () {
            resumeAudioContext();
        });
    }

    // endregion

    // region ===== Error Handling =====================================================================================
    const reportError = createErrorReporter(onError);

    function reportMediaError(playbackError: unknown = null) {
        const mediaError = audio.error;

        if (mediaError) {
            if (mediaError.code === 1) {
                return reportError("loading-aborted", "Audio loading was interrupted.");
            }

            if (mediaError.code === 2) {
                return reportError("network-error", "The audio could not be loaded because of a network error.");
            }

            if (mediaError.code === 3) {
                return reportError("decode-error", "The audio could not be decoded.");
            }

            if (mediaError.code === 4) {
                return reportError("unsupported-source", "This audio source is not supported.");
            }

            return reportError("media-error", "The audio could not be loaded.");
        }

        if (playbackError && (playbackError as {name?: unknown}).name === "NotAllowedError") {
            return reportError("playback-blocked", "Playback was blocked by the browser.");
        }

        if (playbackError) {
            return reportError("playback-failed", "Playback could not start.");
        }

        return reportError("media-error", "The audio could not be loaded.");
    }

    // endregion

    // region ===== State ==============================================================================================
    let stateChanged = false; // engine-owned primitives mark changes at their mutation sites
    let hasNotified = false;
    let observedMedia: ReturnType<typeof getMediaObservation>;
    let notifiedPitchSemitones = 0;
    let notifiedPitchActive = false;
    const subscriptions = new WeakMap<(state: AudioState) => void, (state: AudioState) => void>();
    const notifier = createNotifier(function () {
        const state = getState();
        syncMediaSessionState(state);
        return state;
    });

    // Subscription is silent. Stable wrappers preserve Set identity while each consumer owns its nested snapshots.
    function subscribe(listener: (state: AudioState) => void): () => void {
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
                    pitchShift: {...state.pitchShift},
                    watchProgress: {...state.watchProgress}
                });
            };
            subscriptions.set(listener, wrapped);
        }

        return notifier.subscribe(wrapped);
    }

    // Native media properties and storage can change outside this engine. Observe their published
    // primitives without formatting or serializing the full state; public reads always remain live.
    function getMediaObservation() {
        return {
            source: getSource(), sources: getSources(), paused: isPaused(), ended: hasEnded(),
            seeking: isSeeking(), live: isLive(), currentTime: getCurrentTime(), duration: getDuration(),
            bufferedRanges: getBufferedRanges(getDuration()), volume: getVolume(), muted: isMuted(),
            playbackRate: getPlaybackRate(), loop: isLoopEnabled(),
            pitchSupported: isPitchShiftSupported(), savedTime: getSavedWatchTime()
        };
    }

    function notify() {
        if (destroyed) return;
        const next = getMediaObservation();
        const previous = observedMedia;
        const pitchActive = isPitchShiftActive();
        const changed = stateChanged
            || pitchSemitones !== notifiedPitchSemitones || pitchActive !== notifiedPitchActive
            || next.source !== previous.source || next.paused !== previous.paused || next.ended !== previous.ended
            || next.seeking !== previous.seeking || next.live !== previous.live || next.currentTime !== previous.currentTime
            || next.duration !== previous.duration || next.volume !== previous.volume || next.muted !== previous.muted
            || next.playbackRate !== previous.playbackRate || next.loop !== previous.loop
            || next.pitchSupported !== previous.pitchSupported || next.savedTime !== previous.savedTime
            || next.sources.length !== previous.sources.length
            || next.sources.some(function (source, index) {
                return source.src !== previous.sources[index].src || source.type !== previous.sources[index].type;
            })
            || next.bufferedRanges.length !== previous.bufferedRanges.length
            || next.bufferedRanges.some(function (range, index) {
                return range.startPercent !== previous.bufferedRanges[index].startPercent
                    || range.endPercent !== previous.bufferedRanges[index].endPercent;
            });
        observedMedia = next;
        notifiedPitchSemitones = pitchSemitones;
        notifiedPitchActive = pitchActive;
        stateChanged = false;
        if (changed) {
            hasNotified = true;
            notifier.notify();
        }
    }

    // A snapshot of the media element's current playback state — consumers render from this.
    function getState(): AudioState {
        const source = getSource();
        const sources = getSources();
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
        const keyboardShortcuts = isKeyboardShortcutsEnabled();
        const persistSettings = isPersistSettingsEnabled();
        const pitchShift = getPitchShiftState();
        const watchProgress = getWatchProgressState(currentTime, duration);

        return {
            source: source,
            sources: sources,
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
            keyboardShortcuts: keyboardShortcuts,
            persistSettings: persistSettings,
            pitchShift: pitchShift,
            watchProgress: watchProgress
        };
    }

    function getSource() {
        return audio.currentSrc || audio.src || "";
    }

    function getSources() {
        const sources = [];

        if (audio.src) {
            sources.push({src: audio.src, type: ""});
        }

        audio.querySelectorAll("source").forEach(function (source) {
            sources.push({
                src: source.src,
                type: source.type || ""
            });
        });

        return sources;
    }

    function isPaused() {
        return audio.paused;
    }

    function hasEnded() {
        return audio.ended;
    }

    function isPlaying() {
        return !audio.paused && !audio.ended;
    }

    function isBuffering() {
        return buffering;
    }

    function getBufferedRanges(duration: number) {
        const ranges: {startPercent: number; endPercent: number;}[] = [];
        if (!duration || !audio.buffered) return ranges;

        for (let index = 0; index < audio.buffered.length; index++) {
            const start = audio.buffered.start(index);
            const end = audio.buffered.end(index);

            ranges.push({
                startPercent: start / duration * 100,
                endPercent: end / duration * 100
            });
        }

        return ranges;
    }

    function isSeeking() {
        return audio.seeking;
    }

    function isLive() {
        return audio.duration === Infinity; // a live stream reports an infinite duration
    }

    function getCurrentTime() {
        if (!Number.isFinite(audio.currentTime)) return 0;

        return audio.currentTime;
    }

    function getCurrentTimeFormatted() {
        return formatTime(getCurrentTime());
    }

    function getDuration() {
        if (!Number.isFinite(audio.duration)) return 0;

        return audio.duration;
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
        return audio.volume;
    }

    function getVolumeFormatted() {
        return formatVolume(getVolume());
    }

    function isMuted() {
        return audio.muted;
    }

    function getPlaybackRate() {
        return audio.playbackRate;
    }

    function isLoopEnabled() {
        return audio.loop;
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

    function isKeyboardShortcutsEnabled() {
        return keyboardShortcutsEnabled;
    }

    function isPersistSettingsEnabled() {
        return persistSettings;
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
        stateChanged ||= buffering || abLoopStart !== 0 || abLoopEnd !== 0 || watchProgressRestored;
        buffering = false;
        abLoopStart = 0;
        abLoopEnd = 0;
        watchProgressRestored = false;
        lastWatchProgressSaveTime = 0;

        audio.load();

        notify();
        return true;
    }

    function applySources(sources: AudioSource[]) {
        audio.pause();
        if (destroyed) return false;
        audio.removeAttribute("src");

        audio.querySelectorAll("source").forEach(function (source) {
            source.remove();
        });

        sources.forEach(function (source: AudioSource) {
            const sourceElement = ownerDocument.createElement("source");
            sourceElement.src = source.src;

            if (source.type) {
                sourceElement.type = source.type;
            }

            audio.appendChild(sourceElement);
        });

        return load();
    }

    function setSources(nextSources: AudioSource[]): boolean {
        if (destroyed) return false;

        validateSources(nextSources);
        const playbackRate = getPlaybackRate();
        const rateRevision = playbackRateRevision;
        const loaded = applySources(nextSources);
        if (destroyed) return false;

        if (rateRevision === playbackRateRevision && getPlaybackRate() !== playbackRate) {
            audio.playbackRate = playbackRate;
        }

        if (pitchShift) applyPreservesPitch();

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

        audio.currentTime = nextTime;

        return true;
    }

    async function play(): Promise<boolean> {
        if (destroyed) return false;
        if (isPlaying()) return true;

        try {
            await audio.play();
        } catch (error) {
            if (destroyed) return false;
            if (error && (error as {name?: unknown}).name === "AbortError") return false; // superseded by a competing load — not a failure worth reporting

            reportMediaError(error);
            return false;
        }

        if (destroyed) return false;

        notify();
        return true;
    }

    function pause(): boolean {
        if (destroyed) return false;
        if (audio.paused) return true;

        audio.pause();
        notify();
        return true;
    }

    function stop(): boolean {
        if (destroyed) return false;

        const wasPlaying = isPlaying();
        const changed = setCurrentTime(0);

        if (wasPlaying) audio.pause();
        if (wasPlaying || changed) notify();

        return true;
    }

    async function retry(): Promise<boolean> {
        if (destroyed) return false;

        audio.load();
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
            throw new TypeError("createAudio: seek time must be a non-negative number of seconds.");
        }

        return time;
    }

    function parseSeekStep(seconds: number) {
        const offset = Number(seconds);

        if (!Number.isFinite(offset) || offset <= 0) {
            throw new TypeError("createAudio: the seek offset must be a positive number of seconds.");
        }

        return offset;
    }

    function parseSeekPercent(value: number) {
        const percent = Number(value);

        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
            throw new TypeError("createAudio: the seek percent must be a number from 0 to 100.");
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
            remainingTimeFormatted: `-${formatTime(remainingTime)}`
        };
    }

    function getSeekPreviewAtPosition(position: number, width: number): {
        percent: number;
        time: number;
        timeFormatted: string;
        remainingTime: number;
        remainingTimeFormatted: string;
    } {
        const seekPosition = Number(position);
        const seekWidth = Number(width);

        if (!Number.isFinite(seekPosition)) {
            throw new TypeError("createAudio: the seek preview position must be a finite number.");
        }

        if (!Number.isFinite(seekWidth) || seekWidth <= 0) {
            throw new TypeError("createAudio: the seek preview width must be a positive number.");
        }

        return getSeekPreviewAtPercent(Math.max(0, Math.min(seekPosition / seekWidth * 100, 100)));
    }

    function clampSeekTime(time: number) {
        const duration = getDuration();
        if (!duration) return Math.max(0, time); // duration unknown — only the lower bound is knowable

        return Math.max(0, Math.min(time, duration)); // relative seeks can overshoot either end; hold the target inside [0, duration]
    }

    function togglePlayback(): void {
        if (isPlaying()) {
            pause();
        } else {
            void play();
        }
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
            throw new TypeError(`createAudio: playback rate must be a number from ${minimumPlaybackRate} to ${maximumPlaybackRate}.`);
        }

        playbackRateRevision++; // a reentrant explicit choice owns the rate, even if native load already reset it there
        if (getPlaybackRate() === rate) return false;

        audio.playbackRate = rate;
        savePersistedSettings();
        notify();
        return true;
    }

    function increasePlaybackRate(step: number = 0.05): boolean {
        if (destroyed) return false;

        const amount = Number(step);

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new TypeError("createAudio: playback rate step must be a positive number.");
        }

        return setPlaybackRate(Math.min(getPlaybackRate() + amount, maximumPlaybackRate));
    }

    function decreasePlaybackRate(step: number = 0.05): boolean {
        if (destroyed) return false;

        const amount = Number(step);

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new TypeError("createAudio: playback rate step must be a positive number.");
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
            throw new TypeError("createAudio: loop must be a boolean.");
        }

        if (isLoopEnabled() === enabled) return true;

        audio.loop = enabled;
        savePersistedSettings();
        notify();
        return true;
    }

    function toggleLoop(): boolean {
        if (destroyed) return false;

        return setLoop(!isLoopEnabled());
    }

    function applyLoop() {
        audio.loop = loop;
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
            throw new TypeError("createAudio: AB loop time must be a non-negative number of seconds.");
        }

        return clampSeekTime(time);
    }

    // endregion

    // region ===== Volume Controls ====================================================================================
    function setVolume(value: number): boolean {
        if (destroyed) return false;

        const volume = parseVolume(value);
        let changed = audio.volume !== volume;

        if (changed) audio.volume = volume;

        // Raising the volume above zero implies intent to hear audio, so clear any mute to match.
        if (volume > 0 && isMuted()) {
            audio.muted = false;
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
            throw new TypeError("createAudio: muted must be a boolean.");
        }

        if (isMuted() === enabled) return true;

        audio.muted = enabled;
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
            throw new TypeError("createAudio: volume must be a number from 0 to 1.");
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
            throw new TypeError("createAudio: autoplay must be a boolean.");
        }

        if (!enabled) {
            autoplayAttempt++; // an older play rejection cannot re-block disabled autoplay
            if (!isAutoplayEnabled() && !isAutoplayBlocked()) return true;

            autoplayEnabled = false;
            autoplayBlocked = false;
            stateChanged = true;
            notify();
            return true;
        }

        if (!autoplayEnabled) stateChanged = true;
        autoplayEnabled = true;
        return startAutoplay();
    }

    async function startAutoplay() {
        if (destroyed) return false;

        const attempt = ++autoplayAttempt;
        stateChanged ||= !autoplayAttempted || autoplayBlocked;
        autoplayAttempted = true;
        autoplayBlocked = false;
        notify();
        if (destroyed || attempt !== autoplayAttempt) return false;

        try {
            await audio.play();
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

    // region ===== Keyboard Shortcuts =================================================================================
    let keyboardShortcutsEnabled = keyboardShortcuts;

    function setKeyboardShortcuts(enabled: boolean): boolean {
        if (destroyed) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createAudio: keyboard shortcuts must be a boolean.");
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
            {id: "seek-to-start", keys: ["0", "Home"], message: "Jump to the start"},
            {
                id: "seek-to-percent",
                keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"],
                message: "Jump to 10%–90% of the audio"
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
            toggleMuted();
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
        if (!target || target === playerContainer || target === audio) return false;
        if (target.isContentEditable) return true;

        return ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(target.tagName);
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

    function setMediaSession(nextMediaSession: AudioMediaSession): boolean {
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
                if (destroyed) return;
                if (!details || !Number.isFinite(Number(details.seekTime))) return;

                if (details.fastSeek && typeof audio.fastSeek === "function") {
                    audio.fastSeek(Number(details.seekTime));
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

    function syncMediaSessionState(state: AudioState) {
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
    const persistSettingsKey = "strata-audio-settings";

    function getPersistedSettings() {
        if (!isPersistSettingsEnabled()) return null;

        const storage = getLocalStorage(audio);
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

        const storage = getLocalStorage(audio);
        if (!storage) return false;

        try {
            storage.setItem(persistSettingsKey, JSON.stringify({
                volume: getVolume(),
                muted: isMuted(),
                playbackRate: getPlaybackRate(),
                loop: isLoopEnabled(),
                pitchSemitones: getPitchSemitones()
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

        if (Number.isFinite(volume) && volume >= 0 && volume <= 1 && audio.volume !== volume) {
            audio.volume = volume;
        }

        // Apply persisted muted state.
        if (typeof settings.muted === "boolean" && isMuted() !== settings.muted) {
            audio.muted = settings.muted;
        }

        // Apply persisted playback rate.
        const playbackRate = Number(settings.playbackRate);

        if (Number.isFinite(playbackRate) && playbackRate >= minimumPlaybackRate && playbackRate <= maximumPlaybackRate && getPlaybackRate() !== playbackRate) {
            audio.playbackRate = playbackRate;
        }

        // Apply persisted repeat.
        if (typeof settings.loop === "boolean") {
            audio.loop = settings.loop;
        }

        // Apply persisted pitch.
        const pitch = Number(settings.pitchSemitones);

        if (
            isPitchShiftEnabled()
            && isPitchShiftSupported()
            && Number.isFinite(pitch)
            && pitch >= minimumPitchSemitones
            && pitch <= maximumPitchSemitones
        ) {
            void setPitch(pitch);
        }

        return true;
    }

    function clearPersistedSettings(): boolean {
        if (destroyed) return false;
        if (!isPersistSettingsEnabled()) return false;

        const storage = getLocalStorage(audio);
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
        return `audio-watch-progress:${audioId}`;
    }

    function getSavedWatchProgress() {
        if (!watchProgress) return null;

        const storage = getLocalStorage(audio);
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

    function getSavedWatchTime() {
        const progress = getSavedWatchProgress();
        const time = progress ? Number(progress.currentTime) : 0;
        return Number.isFinite(time) && time >= 0 ? time : 0;
    }

    function saveWatchProgress(force = true) {
        if (!watchProgress) return false;

        // A snapshot without a source or duration is meaningless — refusing it also stops the browser's
        // unload-time `pause` event (fired against an already-emptied element) from clobbering a real save.
        if (!getSource() || !getDuration()) return false;

        const now = Date.now();
        if (!force && now - lastWatchProgressSaveTime < watchProgressSaveInterval) return false;

        const storage = getLocalStorage(audio);
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
                ended: audio.ended,
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

    // region ===== Pitch Shifter ======================================================================================
    const minimumPitchSemitones = -12; // clamp floor — deeper than this is rarely musical
    const maximumPitchSemitones = 12; // clamp ceiling — higher than this is rarely musical
    let pitchSemitones = 0; // the requested shift in semitones (0 = no shift)
    let audioContext: AudioContext | null = null; // created lazily on the first real shift
    let mediaElementSource: MediaElementAudioSourceNode | null = null; // the once-only element tap, cached because a second tap on the same element throws
    let pitchShiftNode: StretchNode | null = null; // the Signalsmith Stretch node, once built
    let pitchShiftGraphPromise: Promise<boolean> | null = null; // the in-flight graph build, shared so overlapping setPitch calls build only once

    // Shift the pitch by a number of semitones (0 = no shift) without touching the playback speed. The first real
    // shift irreversibly reroutes the element's audio through a Web Audio graph; until then playback stays native.
    async function setPitch(semitones: number): Promise<boolean> {
        if (destroyed) return false;

        const nextSemitones = parsePitchSemitones(semitones);
        if (!isPitchShiftEnabled()) return false;

        if (!isPitchShiftSupported()) {
            reportError("pitch-shift-unavailable", "Pitch shifting is not available in this browser.");
            return false;
        }

        if (getPitchSemitones() === nextSemitones) return true;

        pitchSemitones = nextSemitones;

        // A zero shift before any graph exists changes nothing audible — skip the irreversible element tap.
        if (!pitchShiftNode && nextSemitones === 0) {
            savePersistedSettings();
            notify();
            return true;
        }

        if (!pitchShiftNode) {
            let graphBuild = pitchShiftGraphPromise;
            if (!graphBuild) {
                graphBuild = createPitchShiftGraph();
                // An error consumer may synchronously start a newer build before this call returns.
                if (!destroyed && !pitchShiftGraphPromise) pitchShiftGraphPromise = graphBuild;
            }

            const graphReady = await graphBuild;
            if (destroyed) return false;

            if (!graphReady) {

                // Only clean up if this is still the current build: a re-entrant setPitch (from a notify() during a
                // sibling call's failure) may have replaced it, and clobbering that newer build would strand it.
                if (pitchShiftGraphPromise === graphBuild) {
                    pitchShiftGraphPromise = null; // a failed build (say, a cross-origin source) can succeed later, so let the next call retry
                    pitchSemitones = 0; // the shift never took effect, so the state must not claim it did
                    notify();
                }

                return false;
            }
        }

        applyPitchSemitones();
        resumeAudioContext(); // once tapped, a suspended context is total silence — even at zero shift
        savePersistedSettings();
        notify();
        return true;
    }

    function parsePitchSemitones(value: number) {
        const semitones = Number(value);

        if (!Number.isFinite(semitones)) {
            throw new TypeError("createAudio: pitch must be a finite number of semitones.");
        }

        return clampPitchSemitones(semitones);
    }

    function clampPitchSemitones(semitones: number) {
        return Math.max(minimumPitchSemitones, Math.min(semitones, maximumPitchSemitones));
    }

    function getPitchShiftState() {
        return {
            supported: isPitchShiftSupported(),
            enabled: isPitchShiftEnabled(),
            active: isPitchShiftActive(),
            semitones: getPitchSemitones()
        };
    }

    function getPitchSemitones() {
        return pitchSemitones;
    }

    function isPitchShiftSupported() {
        const view = ownerDocument.defaultView as (Window & typeof globalThis & {webkitAudioContext?: typeof AudioContext}) | null;

        return Boolean(view && (view.AudioContext || view.webkitAudioContext) && view.AudioWorkletNode);
    }

    function isPitchShiftEnabled() {
        return pitchShift;
    }

    function isPitchShiftActive() {
        return Boolean(pitchShiftNode) && getPitchSemitones() !== 0;
    }

    function isSourceCrossOrigin() {
        const source = getSource();
        if (!source) return false;

        try {
            const sourceUrl = new URL(source, ownerDocument.baseURI);
            if (sourceUrl.protocol === "data:") return false; // data: audio is origin-less and can't taint the graph

            return sourceUrl.origin !== new URL(ownerDocument.baseURI).origin;
        } catch {
            return false; // an unparsable source URL is the media element's problem, not the tap's
        }
    }

    // Keep native speed changes pitch-neutral, so the element's playbackRate and the pitch shifter stay orthogonal.
    function applyPreservesPitch() {
        audio.preservesPitch = true;

        if ("webkitPreservesPitch" in audio) {
            audio.webkitPreservesPitch = true; // older WebKit only honors the prefixed property
        }

        if ("mozPreservesPitch" in audio) {
            audio.mozPreservesPitch = true; // older Firefox only honors the prefixed property
        }
    }

    // Push the current shift into the live Signalsmith node. It stays active from creation, so this only updates the
    // semitones of the ongoing pass-through; scheduling with no output time applies it immediately.
    function applyPitchSemitones() {
        if (!pitchShiftNode) return false;

        pitchShiftNode.schedule({semitones: getPitchSemitones()});
        return true;
    }

    function resumeAudioContext() {
        if (!audioContext || audioContext.state !== "suspended") return false;

        audioContext.resume().then(null, function () {}); // a blocked resume just means no user gesture yet — the next play gesture retries
        return true;
    }

    function createAudioContext() {
        if (audioContext) return audioContext;

        const view = ownerDocument.defaultView as (Window & typeof globalThis & {webkitAudioContext?: typeof AudioContext}) | null;
        const contextConstructor = view!.AudioContext || view!.webkitAudioContext!; // older WebKit only ships the prefixed constructor

        try {
            audioContext = new contextConstructor();
        } catch {
            reportError("pitch-shift-unavailable", "Pitch shifting is not available in this browser.");
            return null;
        }

        return audioContext;
    }

    // The one and only element tap: createMediaElementSource works once per element for its whole lifetime, so this
    // cached node is the single source every future graph consumer (a visualizer, a waveform) must share. Element
    // volume and muted still shape the tapped signal — modern browsers apply them at the source — so setVolume and
    // setMuted keep working with no graph-side gain node.
    function createMediaElementSourceTap(context: AudioContext) {
        if (destroyed) return null;
        if (mediaElementSource) return mediaElementSource;

        // Without CORS opt-in, a cross-origin source reaches the graph as pure silence, so refuse the tap up front
        // and leave playback native and audible.
        if (isSourceCrossOrigin() && !audio.crossOrigin) {
            reportError("pitch-shift-cross-origin", "This audio cannot be pitch shifted because its source comes from another site.");
            return null;
        }

        try {
            mediaElementSource = context.createMediaElementSource(audio);
        } catch {
            reportError("pitch-shift-source-tap-failed", "The audio could not be routed through the pitch shifter.");
            return null;
        }

        return mediaElementSource;
    }

    // Build the Signalsmith Stretch node and start it active so live input passes straight through at the current
    // shift. Its creation is async (it registers its own AudioWorklet on first use), so destroy() may land mid-await.
    async function createPitchShiftNode(context: AudioContext) {
        try {
            const node = await SignalsmithStretch(context);
            if (destroyed) {
                node.disconnect(); // readiness may arrive after teardown closed the context
                return null;
            }

            pitchShiftNode = node;
            node.schedule({active: true, semitones: getPitchSemitones()}); // active = pass live input through; a segment left inactive outputs silence
        } catch {
            if (destroyed) return null; // teardown races the build — not a real failure

            pitchShiftNode = null;
            reportError("pitch-shift-worklet-failed", "The pitch shifter could not be started.");
            return null;
        }

        return pitchShiftNode;
    }

    // Build the whole shifting chain — context, element tap, Signalsmith node — on the first real shift.
    async function createPitchShiftGraph() {
        const context = createAudioContext();
        if (!context) return false;

        const sourceTap = createMediaElementSourceTap(context);
        if (!sourceTap) return false;

        const node = await createPitchShiftNode(context);
        if (destroyed) return false; // destroy() can land during node creation and close the context

        if (!node) {

            // The element is already irreversibly tapped — route it straight to the speakers rather than leaving it silent.
            try {
                sourceTap.connect(context.destination);
            } catch {
            }

            return false;
        }

        sourceTap.disconnect(); // a previous failed worklet build may have installed a direct fallback route
        sourceTap.connect(node);
        node.connect(context.destination);
        return true;
    }

    function clearPitchShiftGraph() {
        if (pitchShiftNode) {
            pitchShiftNode.disconnect();
            pitchShiftNode = null;
        }

        if (mediaElementSource) {
            mediaElementSource.disconnect();
            mediaElementSource = null;
        }

        if (audioContext && audioContext.state !== "closed") {
            audioContext.close().then(null, function () {}); // an already-closing context rejecting here is harmless
        }

        audioContext = null;
        pitchShiftGraphPromise = null;
    }

    // endregion

    // region ===== Tear Down ==========================================================================================
    function destroy(): void {
        if (destroyed) return;
        destroyed = true; // external cleanup cannot re-enter a live engine
        notifier.destroy();

        saveWatchProgress(true);

        clearMediaSessionState();

        clearPitchShiftGraph();

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
        setPitch,
        setKeyboardShortcuts,
        listKeyboardShortcuts,
        resumeWatchProgress,
        destroy
    };
}
