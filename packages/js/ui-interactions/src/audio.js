import {callConsumer, createErrorReporter} from './internal/core.js';

export function formatTime(seconds) {
    const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = Math.floor(safeSeconds % 60).toString().padStart(2, "0");

    return `${minutes}:${remainingSeconds}`;
}

function getLocalStorage(element) {
    try {
        return element.ownerDocument.defaultView.localStorage;
    } catch {
        return null;
    }
}

export function createAudio(audio, config = {}) {
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

    function validateSources(value) {
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

    function validateMediaSession(value) {
        if (value === undefined || value === null) return;

        if (typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError("createAudio: mediaSession must be a metadata object.");
        }

        ["title", "artist", "album"].forEach(function (key) {
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
    const browserNavigator = ownerDocument.defaultView ? ownerDocument.defaultView.navigator : null;
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
    const listeners = new Set(); // change subscribers — each gets the full state on every playback change
    const cleanups = []; // teardown functions, collected so everything can be undone at once

    function registerEventListener(target, type, handler) {
        target.addEventListener(type, handler);

        cleanups.push(function () {
            target.removeEventListener(type, handler); // detach the exact listener that was registered
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
            buffering = false;
            saveWatchProgress(true);
            notify();
        });

        registerEventListener(audio, "ended", function () {
            buffering = false;
            saveWatchProgress(true);
            notify();
        });

        registerEventListener(audio, "loadedmetadata", function () {
            notify();
        });

        // State
        registerEventListener(audio, "waiting", function () {
            buffering = true;
            notify();
        });

        registerEventListener(audio, "stalled", function () {
            buffering = true;
            notify();
        });

        registerEventListener(audio, "playing", function () {
            buffering = false;
            notify();
        });

        registerEventListener(audio, "canplay", function () {
            buffering = false;
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

    function reportMediaError(playbackError = null) {
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

        if (playbackError && playbackError.name === "NotAllowedError") {
            return reportError("playback-blocked", "Playback was blocked by the browser.");
        }

        if (playbackError) {
            return reportError("playback-failed", "Playback could not start.");
        }

        return reportError("media-error", "The audio could not be loaded.");
    }

    // endregion

    // region ===== State ==============================================================================================
    let lastStateSignature = ""; // last emitted state fingerprint, used to avoid duplicate media-event echoes

    // Subscribe to playback changes. The listener gets the state on every change (not immediately — read getState() for the first paint). Returns an unsubscribe function.
    function subscribe(listener) {
        if (destroyed) return function unsubscribe() {}; // dead engine: nothing will fire, and nothing gets retained

        listeners.add(listener);

        return function unsubscribe() {
            listeners.delete(listener);
        };
    }

    // Emit the current state to every subscriber. Called after any meaningful playback change.
    function notify() {
        if (destroyed) return;
        const state = getState();
        const stateSignature = getStateSignature(state);
        if (stateSignature === lastStateSignature) return;

        lastStateSignature = stateSignature;
        syncMediaSessionState(state);

        for (const listener of listeners) {
            callConsumer(listener, state);
        }
    }

    // getState() returns a new object every call, so notify() can't detect no-op changes by reference alone — this gives it a comparable string instead.
    function getStateSignature(state) {
        return JSON.stringify(state);
    }

    // A snapshot of the media element's current playback state — consumers render from this.
    function getState() {
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

    function getBufferedRanges(duration) {
        const ranges = [];
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

    function getRemainingTime(currentTime, duration) {
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

    function getWatchProgressState(currentTime, duration) {
        const progress = getSavedWatchProgress();
        const savedTime = progress ? Number(progress.currentTime) : 0;
        const safeSavedTime = Number.isFinite(savedTime) && savedTime >= 0 ? savedTime : 0;

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
    function load() {
        if (destroyed) return false;

        // Clear transient media state
        buffering = false;
        abLoopStart = 0;
        abLoopEnd = 0;
        watchProgressRestored = false;
        lastWatchProgressSaveTime = 0;

        audio.load();

        notify();
        return true;
    }

    function applySources(sources) {
        audio.pause();
        audio.removeAttribute("src");

        audio.querySelectorAll("source").forEach(function (source) {
            source.remove();
        });

        sources.forEach(function (source) {
            const sourceElement = ownerDocument.createElement("source");
            sourceElement.src = source.src;

            if (source.type) {
                sourceElement.type = source.type;
            }

            audio.appendChild(sourceElement);
        });

        return load();
    }

    function setSources(nextSources) {
        if (destroyed) return false;

        validateSources(nextSources);
        const playbackRate = getPlaybackRate();
        const loaded = applySources(nextSources);

        if (getPlaybackRate() !== playbackRate) {
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

    function setCurrentTime(time) {
        const nextTime = clampSeekTime(time);
        if (getCurrentTime() === nextTime) return false;

        audio.currentTime = nextTime;

        return true;
    }

    async function play() {
        if (destroyed) return false;
        if (isPlaying()) return true;

        try {
            await audio.play();
        } catch (error) {
            if (error && error.name === "AbortError") return false; // superseded by a competing load — not a failure worth reporting

            reportMediaError(error);
            return false;
        }

        if (destroyed) return false;

        notify();
        return true;
    }

    function pause() {
        if (destroyed) return false;
        if (audio.paused) return true;

        audio.pause();
        notify();
        return true;
    }

    function stop() {
        if (destroyed) return false;

        const wasPlaying = isPlaying();
        const changed = setCurrentTime(0);

        if (wasPlaying) audio.pause();
        if (wasPlaying || changed) notify();

        return true;
    }

    async function retry() {
        if (destroyed) return false;

        audio.load();
        return play();
    }

    function seek(value) {
        if (destroyed) return false;

        const time = parseSeekTime(value);
        const changed = setCurrentTime(time);

        if (changed) notify();

        return changed;
    }

    function seekForward(seconds = 10) {
        if (destroyed) return false;

        const changed = setCurrentTime(getCurrentTime() + parseSeekStep(seconds));

        if (changed) notify();

        return changed;
    }

    function seekBackward(seconds = 10) {
        if (destroyed) return false;

        const changed = setCurrentTime(getCurrentTime() - parseSeekStep(seconds));

        if (changed) notify();

        return changed;
    }

    function seekToPercent(value) {
        if (destroyed) return false;

        const percent = parseSeekPercent(value);
        const changed = setCurrentTime(getSeekTimeAtPercent(percent));

        if (changed) notify();

        return changed;
    }

    function parseSeekTime(value) {
        const time = Number(value);

        if (!Number.isFinite(time) || time < 0) {
            throw new TypeError("createAudio: seek time must be a non-negative number of seconds.");
        }

        return time;
    }

    function parseSeekStep(seconds) {
        const offset = Number(seconds);

        if (!Number.isFinite(offset) || offset <= 0) {
            throw new TypeError("createAudio: the seek offset must be a positive number of seconds.");
        }

        return offset;
    }

    function parseSeekPercent(value) {
        const percent = Number(value);

        if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
            throw new TypeError("createAudio: the seek percent must be a number from 0 to 100.");
        }

        return percent;
    }

    function getSeekTimeAtPercent(value) {
        const percent = parseSeekPercent(value);
        if (isLive()) return getCurrentTime(); // live has no fixed length, so percent maps to no move

        return getDuration() * percent / 100;
    }

    function getSeekPreviewAtPercent(value) {
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

    function getSeekPreviewAtPosition(position, width) {
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

    function clampSeekTime(time) {
        const duration = getDuration();
        if (!duration) return Math.max(0, time); // duration unknown — only the lower bound is knowable

        return Math.max(0, Math.min(time, duration)); // relative seeks can overshoot either end; hold the target inside [0, duration]
    }

    function togglePlayback() {
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

    function setPlaybackRate(value) {
        if (destroyed) return false;

        const rate = Number(value);

        if (!Number.isFinite(rate) || rate < minimumPlaybackRate || rate > maximumPlaybackRate) {
            throw new TypeError(`createAudio: playback rate must be a number from ${minimumPlaybackRate} to ${maximumPlaybackRate}.`);
        }

        if (getPlaybackRate() === rate) return false;

        audio.playbackRate = rate;
        savePersistedSettings();
        notify();
        return true;
    }

    function increasePlaybackRate(step = 0.05) {
        if (destroyed) return false;

        const amount = Number(step);

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new TypeError("createAudio: playback rate step must be a positive number.");
        }

        return setPlaybackRate(Math.min(getPlaybackRate() + amount, maximumPlaybackRate));
    }

    function decreasePlaybackRate(step = 0.05) {
        if (destroyed) return false;

        const amount = Number(step);

        if (!Number.isFinite(amount) || amount <= 0) {
            throw new TypeError("createAudio: playback rate step must be a positive number.");
        }

        return setPlaybackRate(Math.max(getPlaybackRate() - amount, minimumPlaybackRate));
    }

    function resetPlaybackRate() {
        if (destroyed) return false;

        return setPlaybackRate(1);
    }

    // endregion

    // region ===== Loop Controls ======================================================================================
    function setLoop(enabled) {
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

    function toggleLoop() {
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

    function setAbLoopStart(value = getCurrentTime()) {
        if (destroyed) return false;

        const time = parseAbLoopTime(value);
        if (getAbLoopStart() === time) return true;

        abLoopStart = time;

        if (getAbLoopEnd() && getAbLoopEnd() <= getAbLoopStart()) {
            abLoopEnd = 0;
        }

        notify();
        return true;
    }

    function setAbLoopEnd(value = getCurrentTime()) {
        if (destroyed) return false;

        const time = parseAbLoopTime(value);
        if (time <= getAbLoopStart()) return false;
        if (getAbLoopEnd() === time) return true;

        abLoopEnd = time;
        notify();
        return true;
    }

    function clearAbLoop() {
        if (destroyed) return false;
        if (!getAbLoopStart() && !getAbLoopEnd()) return true;

        abLoopStart = 0;
        abLoopEnd = 0;
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

    function parseAbLoopTime(value) {
        const time = Number(value);

        if (!Number.isFinite(time) || time < 0) {
            throw new TypeError("createAudio: AB loop time must be a non-negative number of seconds.");
        }

        return clampSeekTime(time);
    }

    // endregion

    // region ===== Volume Controls ====================================================================================
    function setVolume(value) {
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

    function increaseVolume(step = 0.05) {
        if (destroyed) return false;

        const volumeStep = parseVolume(step);
        if (volumeStep === 0) return false;

        return setVolume(Math.min(getVolume() + volumeStep, 1));
    }

    function decreaseVolume(step = 0.05) {
        if (destroyed) return false;

        const volumeStep = parseVolume(step);
        if (volumeStep === 0) return false;

        return setVolume(Math.max(getVolume() - volumeStep, 0));
    }

    function setMuted(enabled) {
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

    function toggleMuted() {
        if (destroyed) return false;

        return setMuted(!isMuted());
    }

    function parseVolume(value) {
        const volume = Number(value);

        if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
            throw new TypeError("createAudio: volume must be a number from 0 to 1.");
        }

        return volume;
    }

    function formatVolume(value) {
        return `${Math.round(value * 100)}%`;
    }

    // endregion

    // region ===== Autoplay Controls ==================================================================================
    let autoplayEnabled = autoplay;
    let autoplayAttempted = false;
    let autoplayBlocked = false;

    async function setAutoplay(enabled) {
        if (destroyed) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createAudio: autoplay must be a boolean.");
        }

        if (!enabled) {
            if (!isAutoplayEnabled() && !isAutoplayBlocked()) return true;

            autoplayEnabled = false;
            autoplayBlocked = false;
            notify();
            return true;
        }

        autoplayEnabled = true;
        return startAutoplay();
    }

    async function startAutoplay() {
        if (destroyed) return false;

        autoplayAttempted = true;
        autoplayBlocked = false;
        notify();

        try {
            await audio.play();
        } catch (error) {
            if (error && error.name === "AbortError") return false; // superseded by a competing load — not an autoplay policy block

            autoplayBlocked = true;
            notify();
            return false;
        }

        if (destroyed) return false;

        notify();
        return true;
    }

    // endregion

    // region ===== Keyboard Shortcuts =================================================================================
    let keyboardShortcutsEnabled = keyboardShortcuts;

    function setKeyboardShortcuts(enabled) {
        if (destroyed) return false;

        if (typeof enabled !== "boolean") {
            throw new TypeError("createAudio: keyboard shortcuts must be a boolean.");
        }

        if (isKeyboardShortcutsEnabled() === enabled) return true;

        keyboardShortcutsEnabled = enabled;
        notify();
        return true;
    }

    function listKeyboardShortcuts() {
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

    function handleKeyboardShortcut(event) {
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

    function shouldIgnoreKeyboardShortcut(event) {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return true;

        const target = event.target;
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
        return Boolean(browserNavigator && browserNavigator.mediaSession);
    }

    function applyMediaSession() {
        const mediaSessionState = getMediaSessionState();
        if (!mediaSessionState.enabled || !mediaSessionState.active) return false;

        applyMediaSessionMetadata();
        applyMediaSessionActionHandlers();
        syncMediaSessionState(getState());
        return true;
    }

    function setMediaSession(nextMediaSession) {
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
            if (typeof ownerDocument.defaultView.MediaMetadata === "function") {
                browserNavigator.mediaSession.metadata = new ownerDocument.defaultView.MediaMetadata(metadata);
            } else {
                browserNavigator.mediaSession.metadata = metadata;
            }

            return true;
        } catch {
            return false;
        }
    }

    function applyMediaSessionActionHandlers() {
        if (!isMediaSessionSupported() || typeof browserNavigator.mediaSession.setActionHandler !== "function") return false;

        const handlers = {
            play: function () {
                void play();
            },
            pause: function () {
                pause();
            },
            stop: function () {
                stop();
            },
            seekbackward: function (details) {
                seekBackward(details && details.seekOffset ? details.seekOffset : 10);
            },
            seekforward: function (details) {
                seekForward(details && details.seekOffset ? details.seekOffset : 10);
            },
            seekto: function (details) {
                if (!details || !Number.isFinite(Number(details.seekTime))) return;

                if (details.fastSeek && typeof audio.fastSeek === "function") {
                    audio.fastSeek(Number(details.seekTime));
                    notify();
                    return;
                }

                seek(details.seekTime);
            }
        };

        Object.keys(handlers).forEach(function (action) {
            try {
                browserNavigator.mediaSession.setActionHandler(action, handlers[action]);
            } catch {
            }
        });

        return true;
    }

    function syncMediaSessionState(state) {
        const mediaSessionState = getMediaSessionState();
        if (!mediaSessionState.enabled || !mediaSessionState.active) return false;

        // Sync the browser-level playback indicator.
        try {
            browserNavigator.mediaSession.playbackState = state.playing ? "playing" : "paused";
        } catch {
        }

        if (typeof browserNavigator.mediaSession.setPositionState !== "function") return true;
        if (!Number.isFinite(state.duration) || state.duration <= 0 || state.live) return true;

        // Sync lock-screen seek position when the media has a fixed duration.
        try {
            browserNavigator.mediaSession.setPositionState({
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
                browserNavigator.mediaSession.metadata = null;
                browserNavigator.mediaSession.playbackState = "none";
            } catch {
            }

            // Clear browser media-session action handlers during teardown.
            if (typeof browserNavigator.mediaSession.setActionHandler === "function") {
                ["play", "pause", "stop", "seekbackward", "seekforward", "seekto"].forEach(function (action) {
                    try {
                        browserNavigator.mediaSession.setActionHandler(action, null);
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

    function clearPersistedSettings() {
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

    function resumeWatchProgress() {
        if (destroyed || !watchProgress || watchProgressRestored) return false;

        const progress = getSavedWatchProgress();
        if (!progress || progress.ended) {
            watchProgressRestored = true;
            return false;
        }

        const source = getSource();
        if (progress.source && source && progress.source !== source) {
            watchProgressRestored = true;
            return false;
        }

        const duration = getDuration();
        const time = Number(progress.currentTime);
        if (!Number.isFinite(time) || time <= 0) {
            watchProgressRestored = true;
            return false;
        }

        if (duration && time >= duration - 2) {
            watchProgressRestored = true;
            return false;
        }

        watchProgressRestored = true;
        const changed = setCurrentTime(time);

        if (changed) notify();

        return changed;
    }

    // endregion

    // region ===== Pitch Shifter ======================================================================================
    const minimumPitchSemitones = -12; // clamp floor — deeper than this is rarely musical
    const maximumPitchSemitones = 12; // clamp ceiling — higher than this is rarely musical
    let pitchSemitones = 0; // the requested shift in semitones (0 = no shift)
    let audioContext = null; // created lazily on the first real shift
    let mediaElementSource = null; // the once-only element tap, cached because a second tap on the same element throws
    let pitchShiftNode = null; // the Signalsmith Stretch node, once built
    let pitchShiftGraphPromise = null; // the in-flight graph build, shared so overlapping setPitch calls build only once

    // Shift the pitch by a number of semitones (0 = no shift) without touching the playback speed. The first real
    // shift irreversibly reroutes the element's audio through a Web Audio graph; until then playback stays native.
    async function setPitch(semitones) {
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
            if (!pitchShiftGraphPromise) {
                pitchShiftGraphPromise = createPitchShiftGraph();
            }

            const graphBuild = pitchShiftGraphPromise; // the exact build this call is awaiting, to tell it apart from a newer one
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

    function parsePitchSemitones(value) {
        const semitones = Number(value);

        if (!Number.isFinite(semitones)) {
            throw new TypeError("createAudio: pitch must be a finite number of semitones.");
        }

        return clampPitchSemitones(semitones);
    }

    function clampPitchSemitones(semitones) {
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
        const view = ownerDocument.defaultView;

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

        const view = ownerDocument.defaultView;
        const contextConstructor = view.AudioContext || view.webkitAudioContext; // older WebKit only ships the prefixed constructor

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
    function createMediaElementSourceTap(context) {
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
    async function createPitchShiftNode(context) {
        try {
            const node = await SignalsmithStretch(context);
            if (destroyed) return null; // destroy() closed the context during the worklet registration — bail

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
    function destroy() {
        if (destroyed) return;

        saveWatchProgress(true);

        clearMediaSessionState();

        clearPitchShiftGraph();

        destroyed = true; // make future work and future destroy calls harmless

        cleanups.forEach(function (cleanup) {
            cleanup();
        });

        cleanups.length = 0; // release references to the cleanup functions and their event targets
        listeners.clear(); // release all subscribers
    }

    // endregion

    init();

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

// region ===== Vendored: Signalsmith Stretch ==========================================================================

// Signalsmith Stretch Web Audio build (UMD), vendored verbatim from
// https://github.com/Signalsmith-Audio/signalsmith-stretch/blob/main/web/release/SignalsmithStretch.js
// MIT licensed, owned third-party source — do NOT read, edit, or restyle it. The WebAssembly binary is
// embedded as base64 inside it, and it self-registers its AudioWorklet through a Blob URL (offline-safe).

var SignalsmithStretch = (() => {
  var _scriptName = typeof document != 'undefined' ? document.currentScript?.src : undefined;
  
  return (
function(moduleArg = {}) {
  var moduleRtn;

var Module=moduleArg;var readyPromiseResolve,readyPromiseReject;var readyPromise=new Promise((resolve,reject)=>{readyPromiseResolve=resolve;readyPromiseReject=reject});var ENVIRONMENT_IS_WEB=typeof window=="object";var ENVIRONMENT_IS_WORKER=typeof WorkerGlobalScope!="undefined";var ENVIRONMENT_IS_NODE=typeof process=="object"&&typeof process.versions=="object"&&typeof process.versions.node=="string"&&process.type!="renderer";var ENVIRONMENT_IS_SHELL=!ENVIRONMENT_IS_WEB&&!ENVIRONMENT_IS_NODE&&!ENVIRONMENT_IS_WORKER;var crypto=globalThis?.crypto||{getRandomValues:array=>{for(var i=0;i<array.length;i++)array[i]=Math.random()*256|0}};var performance=globalThis?.performance||{now:_=>Date.now()};var moduleOverrides=Object.assign({},Module);var arguments_=[];var quit_=(status,toThrow)=>{throw toThrow};var scriptDirectory="";var readAsync,readBinary;if(ENVIRONMENT_IS_SHELL){readBinary=f=>{if(typeof readbuffer=="function"){return new Uint8Array(readbuffer(f))}let data=read(f,"binary");assert(typeof data=="object");return data};readAsync=f=>new Promise((resolve,reject)=>{setTimeout(()=>resolve(readBinary(f)))});globalThis.clearTimeout??=id=>{};globalThis.setTimeout??=f=>f();arguments_=globalThis.arguments||globalThis.scriptArgs;if(typeof quit=="function"){quit_=(status,toThrow)=>{setTimeout(()=>{if(!(toThrow instanceof ExitStatus)){let toLog=toThrow;if(toThrow&&typeof toThrow=="object"&&toThrow.stack){toLog=[toThrow,toThrow.stack]}err(`exiting due to exception: ${toLog}`)}quit(status)});throw toThrow}}if(typeof print!="undefined"){globalThis.console??={};console.log=print;console.warn=console.error=globalThis.printErr??print}}else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){if(ENVIRONMENT_IS_WORKER){scriptDirectory=self.location.href}else if(typeof document!="undefined"&&document.currentScript){scriptDirectory=document.currentScript.src}if(_scriptName){scriptDirectory=_scriptName}if(scriptDirectory.startsWith("blob:")){scriptDirectory=""}else{scriptDirectory=scriptDirectory.substr(0,scriptDirectory.replace(/[?#].*/,"").lastIndexOf("/")+1)}{if(ENVIRONMENT_IS_WORKER){readBinary=url=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)}}readAsync=url=>fetch(url,{credentials:"same-origin"}).then(response=>{if(response.ok){return response.arrayBuffer()}return Promise.reject(new Error(response.status+" : "+response.url))})}}else{}var out=console.log.bind(console);var err=console.error.bind(console);Object.assign(Module,moduleOverrides);moduleOverrides=null;var wasmBinary;if(typeof atob=="undefined"){if(typeof global!="undefined"&&typeof globalThis=="undefined"){globalThis=global}globalThis.atob=function(input){var keyStr="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";var output="";var chr1,chr2,chr3;var enc1,enc2,enc3,enc4;var i=0;input=input.replace(/[^A-Za-z0-9\+\/\=]/g,"");do{enc1=keyStr.indexOf(input.charAt(i++));enc2=keyStr.indexOf(input.charAt(i++));enc3=keyStr.indexOf(input.charAt(i++));enc4=keyStr.indexOf(input.charAt(i++));chr1=enc1<<2|enc2>>4;chr2=(enc2&15)<<4|enc3>>2;chr3=(enc3&3)<<6|enc4;output=output+String.fromCharCode(chr1);if(enc3!==64){output=output+String.fromCharCode(chr2)}if(enc4!==64){output=output+String.fromCharCode(chr3)}}while(i<input.length);return output}}function intArrayFromBase64(s){var decoded=atob(s);var bytes=new Uint8Array(decoded.length);for(var i=0;i<decoded.length;++i){bytes[i]=decoded.charCodeAt(i)}return bytes}function tryParseAsDataURI(filename){if(!isDataURI(filename)){return}return intArrayFromBase64(filename.slice(dataURIPrefix.length))}var wasmMemory;var ABORT=false;var EXITSTATUS;var HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64;function updateMemoryViews(){var b=wasmMemory.buffer;Module["HEAP8"]=HEAP8=new Int8Array(b);HEAP16=new Int16Array(b);HEAPU8=new Uint8Array(b);HEAPU16=new Uint16Array(b);HEAP32=new Int32Array(b);HEAPU32=new Uint32Array(b);HEAPF32=new Float32Array(b);HEAPF64=new Float64Array(b)}var __ATPRERUN__=[];var __ATINIT__=[];var __ATMAIN__=[];var __ATPOSTRUN__=[];var runtimeInitialized=false;function preRun(){callRuntimeCallbacks(__ATPRERUN__)}function initRuntime(){runtimeInitialized=true;callRuntimeCallbacks(__ATINIT__)}function preMain(){callRuntimeCallbacks(__ATMAIN__)}function postRun(){callRuntimeCallbacks(__ATPOSTRUN__)}function addOnInit(cb){__ATINIT__.unshift(cb)}var runDependencies=0;var runDependencyWatcher=null;var dependenciesFulfilled=null;function addRunDependency(id){runDependencies++}function removeRunDependency(id){runDependencies--;if(runDependencies==0){if(runDependencyWatcher!==null){clearInterval(runDependencyWatcher);runDependencyWatcher=null}if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback()}}}function abort(what){what="Aborted("+what+")";err(what);ABORT=true;what+=". Build with -sASSERTIONS for more info.";var e=new WebAssembly.RuntimeError(what);readyPromiseReject(e);throw e}var dataURIPrefix="data:application/octet-stream;base64,";var isDataURI=filename=>filename.startsWith(dataURIPrefix);function findWasmBinary(){var f="data:application/octet-stream;base64,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fyAAKAIIIQMgBCgCACEFAkACQCABQQRPBEAgAyAFckEDcQ0BA0AgAygCACAFKAIARw0CIAVBBGohBSADQQRqIQMgAUEEayIBQQNLDQALCyABRQ0BCwNAIAMtAAAiCSAFLQAAIgpGBEAgBUEBaiEFIANBAWohAyABQQFrIgENAQwCCwsgCSAKawwBC0EACyIBDQBBACEBIAAoAgwiAyAEKAIEIgVGDQBBf0EBIAMgBUkbIQELIAZBEGokACABRSEDCyAEQRBqJAAgAEEgaiQAIANFBEAjAEEQayIFJABBuggQHCEEAn8gAi0AC0EHdgRAIAIoAgQMAQsgAi0AC0H/AHELIQMCfwJ/IwBBEGsiByQAIAhBBGohASADIARqIgBB9////wdNBEACQCAAQQtJBEAgAUIANwIAIAFBADYCCCABIAEtAAtBgAFxIABB/wBxcjoACyABIAEtAAtB/wBxOgALDAELIABBC08EfyAAQQhqQXhxIgYgBkEBayIGIAZBC0YbBUEKC0EBaiIGEAchCCABIAEoAghBgICAgHhxIAZB/////wdxcjYCCCABIAEoAghBgICAgHhyNgIIIAEgCDYCACABIAA2AgQLIAdBEGokACABDAELEA0ACyIALQALQQd2BEAgACgCAAwBCyAACyIAQboIIAQQGyAAIARqIgACfyACLQALQQd2BEAgAigCAAwBCyACCyADEBsgACADaiECIwBBEGsiACQAIABBADoAD0EBIQQDQCAEBEAgAiAALQAPOgAAIARBAWshBCACQQFqIQIMAQsLIABBEGokACAFQRBqJAACfyABLQALQQd2BEAgASgCAAwBC0EACxoQDgALIAhBEGokACAHLAAPQQBIBEAgBygCBBAECyMAQRBrIgIkACMAQRBrIgEkACACQQxqQQQQACIABH9B3DQgADYCAEF/BUEACyABKAIMGiABQRBqJAAEQEHcNCgCABoQDgALIAIoAgwhASACQRBqJABBkDRBASABQf////8HcCICIAJBAU0bNgIAQZw0QgA3AgBBlDRCADcCAEGoNEIANwMAQbA0QgA3AwAgB0EQaiQAQbg0QgA3AgBBwDRBADYCAEHENEIANwIAQcw0QQA2AgBB0DRCADcCAEHYNEEANgIAC+gBAQR/IwBBEGsiBiQAIwBBIGsiAyQAIwBBEGsiBCQAIAQgATYCDCAEIAEgAmo2AgggAyAEKAIMNgIYIAMgBCgCCDYCHCAEQRBqJAAgAygCGCEEIAMoAhwhBSMAQRBrIgIkACACIAU2AgwgBSAEayIFBEAgACAEIAUQEwsgAiAAIAVqNgIIIAMgAigCDDYCECADIAIoAgg2AhQgAkEQaiQAIAMgASADKAIQIAFrajYCDCADIAAgAygCFCAAa2o2AgggBiADKAIMNgIIIAYgAygCCDYCDCADQSBqJAAgBigCDBogBkEQaiQAC38BA38CfwJAAkAgACICQQNxRQ0AQQAgAC0AAEUNAhoDQCAAQQFqIgBBA3FFDQEgAC0AAA0ACwwBCwNAIAAiAUEEaiEAQYCChAggASgCACIDayADckGAgYKEeHFBgIGChHhGDQALA0AgASIAQQFqIQEgAC0AAA0ACwsgACACawsLhQECAX0CfyAAvCICQRd2Qf8BcSIDQZUBTQR9IANB/QBNBEAgAEMAAAAAlA8LAn0gAIsiAEMAAABLkkMAAADLkiAAkyIBQwAAAD9eBEAgACABkkMAAIC/kgwBCyAAIAGSIgAgAUMAAAC/X0UNABogAEMAAIA/kgsiAIwgACACQQBIGwUgAAsLwwQDA38DfAJ+AnwgAL1CNIinQf8PcSIBQckHa0E/TwRAIAFByQdJBEAgAEQAAAAAAADwP6APCyAAvSEHAkAgAUGJCEkNAEQAAAAAAAAAACAHQoCAgICAgIB4UQ0CGiABQf8PTwRAIABEAAAAAAAA8D+gDwsgB0IAWQRAIwBBEGsiAUQAAAAAAAAAcDkDCCABKwMIRAAAAAAAAABwog8LIAdCgICAgICAs8hAVA0AIwBBEGsiAUQAAAAAAAAAEDkDCCABKwMIRAAAAAAAAAAQog8LIAFBACAHQgGGQoCAgICAgICNgX9YGyEBCyAAIABBwB8rAwAiAKAiBSAAoaEiACAAoiIEIASiIABB6B8rAwCiQeAfKwMAoKIgBCAAQdgfKwMAokHQHysDAKCiIABByB8rAwCiIAW9IginQQR0QfAPcSICQfAfaisDAKCgoCEAIAJB+B9qKQMAIAhCLYZ8IQcgAUUEQAJ8IAhCgICAgAiDUARAIAdCgICAgICAgAh9vyIEIACiIASgIgAgAKAMAQsgB0KAgICAgICA8D98vyIEIACiIgUgBKAiAEQAAAAAAADwP2MEfCMAQRBrIgEgAUKAgICAgICACDcDCCABKwMIRAAAAAAAABAAojkDCEQAAAAAAAAAACAARAAAAAAAAPA/oCIGIAUgBCAAoaAgAEQAAAAAAADwPyAGoaCgoEQAAAAAAADwv6AiACAARAAAAAAAAAAAYRsFIAALRAAAAAAAABAAogsPCyAHvyIEIACiIASgCwv+AwECfyACQYAETwRAIAAgASACEAIPCyAAIAJqIQMCQCAAIAFzQQNxRQRAAkAgAEEDcUUEQCAAIQIMAQsgAkUEQCAAIQIMAQsgACECA0AgAiABLQAAOgAAIAFBAWohASACQQFqIgJBA3FFDQEgAiADSQ0ACwsgA0F8cSEAAkAgA0HAAEkNACACIABBQGoiBEsNAANAIAIgASgCADYCACACIAEoAgQ2AgQgAiABKAIINgIIIAIgASgCDDYCDCACIAEoAhA2AhAgAiABKAIUNgIUIAIgASgCGDYCGCACIAEoAhw2AhwgAiABKAIgNgIgIAIgASgCJDYCJCACIAEoAig2AiggAiABKAIsNgIsIAIgASgCMDYCMCACIAEoAjQ2AjQgAiABKAI4NgI4IAIgASgCPDYCPCABQUBrIQEgAkFAayICIARNDQALCyAAIAJNDQEDQCACIAEoAgA2AgAgAUEEaiEBIAJBBGoiAiAASQ0ACwwBCyADQQRJBEAgACECDAELIANBBGsiBCAASQRAIAAhAgwBCyAAIQIDQCACIAEtAAA6AAAgAiABLQABOgABIAIgAS0AAjoAAiACIAEtAAM6AAMgAUEEaiEBIAJBBGoiAiAETQ0ACwsgAiADSQRAA0AgAiABLQAAOgAAIAFBAWohASACQQFqIgIgA0cNAAsLC+YPAhN/A3wjAEEQayIKJAACQCAAvCIQQf////8HcSIDQdqfpO4ETQRAIAEgALsiFiAWRIPIyW0wX+Q/okQAAAAAAAA4Q6BEAAAAAAAAOMOgIhVEAAAAUPsh+b+ioCAVRGNiGmG0EFG+oqAiFzkDACAXRAAAAGD7Iem/YwJ/IBWZRAAAAAAAAOBBYwRAIBWqDAELQYCAgIB4CyEDBEAgASAWIBVEAAAAAAAA8L+gIhVEAAAAUPsh+b+ioCAVRGNiGmG0EFG+oqA5AwAgA0EBayEDDAILIBdEAAAAYPsh6T9kRQ0BIAEgFiAVRAAAAAAAAPA/oCIVRAAAAFD7Ifm/oqAgFURjYhphtBBRvqKgOQMAIANBAWohAwwBCyADQYCAgPwHTwRAIAEgACAAk7s5AwBBACEDDAELIAogAyADQRd2QZYBayIDQRd0a767OQMIIApBCGohDiMAQbAEayIFJAAgAyADQQNrQRhtIgJBACACQQBKGyINQWhsaiEGQeAIKAIAIgdBAE4EQCAHQQFqIQMgDSECA0AgBUHAAmogBEEDdGogAkEASAR8RAAAAAAAAAAABSACQQJ0QfAIaigCALcLOQMAIAJBAWohAiAEQQFqIgQgA0cNAAsLIAZBGGshCEEAIQMgB0EAIAdBAEobIQQDQEEAIQJEAAAAAAAAAAAhFQNAIA4gAkEDdGorAwAgBUHAAmogAyACa0EDdGorAwCiIBWgIRUgAkEBaiICQQFHDQALIAUgA0EDdGogFTkDACADIARGIANBAWohA0UNAAtBLyAGayERQTAgBmshDyAGQRlrIRIgByEDAkADQCAFIANBA3RqKwMAIRVBACECIAMhBCADQQBKBEADQCAFQeADaiACQQJ0agJ/An8gFUQAAAAAAABwPqIiFplEAAAAAAAA4EFjBEAgFqoMAQtBgICAgHgLtyIWRAAAAAAAAHDBoiAVoCIVmUQAAAAAAADgQWMEQCAVqgwBC0GAgICAeAs2AgAgBSAEQQFrIgRBA3RqKwMAIBagIRUgAkEBaiICIANHDQALCwJ/IBUgCBASIhUgFUQAAAAAAADAP6KcRAAAAAAAACDAoqAiFZlEAAAAAAAA4EFjBEAgFaoMAQtBgICAgHgLIQkgFSAJt6EhFQJAAkACQAJ/IAhBAEwiE0UEQCADQQJ0IAVqIgIgAigC3AMiAiACIA91IgIgD3RrIgQ2AtwDIAIgCWohCSAEIBF1DAELIAgNASADQQJ0IAVqKALcA0EXdQsiC0EATA0CDAELQQIhCyAVRAAAAAAAAOA/Zg0AQQAhCwwBC0EAIQJBACEMQQEhBCADQQBKBEADQCAFQeADaiACQQJ0aiIUKAIAIQQCfwJAIBQgDAR/Qf///wcFIARFDQFBgICACAsgBGs2AgBBASEMQQAMAQtBACEMQQELIQQgAkEBaiICIANHDQALCwJAIBMNAEH///8DIQICQAJAIBIOAgEAAgtB////ASECCyADQQJ0IAVqIgwgDCgC3AMgAnE2AtwDCyAJQQFqIQkgC0ECRw0ARAAAAAAAAPA/IBWhIRVBAiELIAQNACAVRAAAAAAAAPA/IAgQEqEhFQsgFUQAAAAAAAAAAGEEQEEAIQQCQCAHIAMiAk4NAANAIAVB4ANqIAJBAWsiAkECdGooAgAgBHIhBCACIAdKDQALIARFDQAgCCEGA0AgBkEYayEGIAVB4ANqIANBAWsiA0ECdGooAgBFDQALDAMLQQEhAgNAIAIiBEEBaiECIAVB4ANqIAcgBGtBAnRqKAIARQ0ACyADIARqIQQDQCAFQcACaiADQQFqIgNBA3RqIAMgDWpBAnRB8AhqKAIAtzkDAEEAIQJEAAAAAAAAAAAhFQNAIA4gAkEDdGorAwAgBUHAAmogAyACa0EDdGorAwCiIBWgIRUgAkEBaiICQQFHDQALIAUgA0EDdGogFTkDACADIARIDQALIAQhAwwBCwsCQCAVQRggBmsQEiIVRAAAAAAAAHBBZgRAIAVB4ANqIANBAnRqAn8CfyAVRAAAAAAAAHA+oiIWmUQAAAAAAADgQWMEQCAWqgwBC0GAgICAeAsiArdEAAAAAAAAcMGiIBWgIhWZRAAAAAAAAOBBYwRAIBWqDAELQYCAgIB4CzYCACADQQFqIQMMAQsCfyAVmUQAAAAAAADgQWMEQCAVqgwBC0GAgICAeAshAiAIIQYLIAVB4ANqIANBAnRqIAI2AgALRAAAAAAAAPA/IAYQEiEVIANBAE4EQCADIQIDQCAFIAIiBEEDdGogFSAFQeADaiACQQJ0aigCALeiOQMAIAJBAWshAiAVRAAAAAAAAHA+oiEVIAQNAAsgAyEEA0BEAAAAAAAAAAAhFUEAIQIgByADIARrIgYgBiAHShsiCEEATgRAA0AgAkEDdEHAHmorAwAgBSACIARqQQN0aisDAKIgFaAhFSACIAhHIAJBAWohAg0ACwsgBUGgAWogBkEDdGogFTkDACAEQQBKIARBAWshBA0ACwtEAAAAAAAAAAAhFSADQQBOBEADQCADIgJBAWshAyAVIAVBoAFqIAJBA3RqKwMAoCEVIAINAAsLIAogFZogFSALGzkDACAFQbAEaiQAIAlBB3EhAyAKKwMAIRUgEEEASARAIAEgFZo5AwBBACADayEDDAELIAEgFTkDAAsgCkEQaiQAIAMLnQUCGH8TfSAAKAIQIAAoAgxrQQN1IAFuIQgCQCABQQRJDQAgAkUNACABQQJ2IglBA2whCyAJQQF0IQwgCEEDbCENIAhBAXQhDiAAKAIAIQoDQCAGIAIgB2xBAnQiAGohDyAAIAVqIRAgBiAHIAtqIAJsQQJ0IgBqIREgACAFaiESIAYgByAMaiACbEECdCIAaiETIAAgBWohFCAGIAcgCWogAmxBAnQiAGohFSAAIAVqIRYgBCAHQQJ0IgAgAmxBAnQiAWohFyABIANqIRggBCAAQQNyIAJsQQJ0IgFqIRkgASADaiEaIAQgAEECciACbEECdCIBaiEbIAEgA2ohHCAEIABBAXIgAmxBAnQiAGohHSAAIANqIR4gCiAHIA1sQQN0aiIAKgIEISYgACoCACEnIAogByAObEEDdGoiACoCBCEoIAAqAgAhKSAKIAcgCGxBA3RqIgAqAgQhKiAAKgIAIStBACEAA0AgFyAAQQJ0IgFqKgIAISEgASAQaiABIBlqKgIAIh8gJpQgASAaaioCACIgICeUkiIiIAEgHWoqAgAiIyAqlCABIB5qKgIAIiQgK5SSIiySIi0gASAbaioCACIlICiUIAEgHGoqAgAiLiAplJIiLyABIBhqKgIAIjCSIjGSOAIAIAEgD2ogHyAnlCAgICaUkyIfICMgK5QgJCAqlJMiIJIiIyAhICUgKZQgLiAolJMiJJIiJZI4AgAgASAWaiAfICCTIh8gMCAvkyIgkjgCACABIBVqICwgIpMiIiAhICSTIiGSOAIAIAEgFGogMSAtkzgCACABIBNqICUgI5M4AgAgASASaiAgIB+TOAIAIAEgEWogISAikzgCACAAQQFqIgAgAkcNAAsgB0EBaiIHIAlHDQALCwudBQIYfxN9IAAoAhAgACgCDGtBA3UgAW4hCAJAIAFBBEkNACACRQ0AIAFBAnYiCUEDbCELIAlBAXQhDCAIQQNsIQ0gCEEBdCEOIAAoAgAhCgNAIAYgAiAHbEECdCIAaiEPIAAgBWohECAGIAcgC2ogAmxBAnQiAGohESAAIAVqIRIgBiAHIAxqIAJsQQJ0IgBqIRMgACAFaiEUIAYgByAJaiACbEECdCIAaiEVIAAgBWohFiAEIAdBAnQiACACbEECdCIBaiEXIAEgA2ohGCAEIABBA3IgAmxBAnQiAWohGSABIANqIRogBCAAQQJyIAJsQQJ0IgFqIRsgASADaiEcIAQgAEEBciACbEECdCIAaiEdIAAgA2ohHiAKIAcgDWxBA3RqIgAqAgQhJiAAKgIAIScgCiAHIA5sQQN0aiIAKgIEISggACoCACEpIAogByAIbEEDdGoiACoCBCEqIAAqAgAhK0EAIQADQCAXIABBAnQiAWoqAgAhISABIBBqIAEgGmoqAgAiHyAnlCABIBlqKgIAIiAgJpSTIiIgASAeaioCACIjICuUIAEgHWoqAgAiJCAqlJMiLJIiLSABIBxqKgIAIiUgKZQgASAbaioCACIuICiUkyIvIAEgGGoqAgAiMJIiMZI4AgAgASAPaiAgICeUIB8gJpSSIh8gJCArlCAjICqUkiIgkiIjICEgLiAplCAlICiUkiIkkiIlkjgCACABIBZqICAgH5MiHyAwIC+TIiCSOAIAIAEgFWogIiAskyIiICEgJJMiIZI4AgAgASAUaiAxIC2TOAIAIAEgE2ogJSAjkzgCACABIBJqICAgH5M4AgAgASARaiAhICKTOAIAIABBAWoiACACRw0ACyAHQQFqIgcgCUcNAAsLC/UsAxd/D30BfkH4MiABNgIAQagyKAIAIgNB9DEoAgAgA0EBdGogAUGsMigCACIPamsgA3AiBmsiBSAPIAUgD0kbIQdB+DEoAgAgACADbEECdGohCgJAIAVB1DIoAgAiAiACIAVLGyIBRQ0AIAogBkECdGohCEHoMigCAEGwMigCACACa0ECdGohCUG8MigCACELIAFBAUcEQCABQX5xIRMDQCAJIARBAnQiDGogCCAMaioCACALIAxqKgIAjJQ4AgAgCSAMQQRyIgxqIAggDGoqAgAgCyAMaioCAIyUOAIAIARBAmohBCAUQQJqIhQgE0cNAAsLIAFBAXFFDQAgCSAEQQJ0IgRqIAQgCGoqAgAgBCALaioCAIyUOAIACyACIAdLIQsCQCACIAVNDQAgAUEBaiEEIAogBiADa0ECdGohBUHoMigCAEGwMigCACACa0ECdGohCEG8MigCACEJIAIgAWtBAXEEQCAIIAFBAnQiAWogASAFaioCACABIAlqKgIAjJQ4AgAgBCEBCyACIARGDQADQCAIIAFBAnQiBGogBCAFaioCACAEIAlqKgIAjJQ4AgAgCCAEQQRqIgRqIAQgBWoqAgAgBCAJaioCAIyUOAIAIAFBAmoiASACSQ0ACwsgAiAHIAsbIQECQCACIAdPDQAgAkEBaiEFIAogBkECdGohB0HoMigCACEIQbwyKAIAIQkgASACIgRrQQFxBEAgCCAHIAJBAnQiBGoqAgAgBCAJaioCAJQ4AgAgBSEECyABIAVGDQADQCAIIAQgAmtBAnRqIAcgBEECdCIFaioCACAFIAlqKgIAlDgCACAIIARBAWoiBSACa0ECdGogByAFQQJ0IgVqKgIAIAUgCWoqAgCUOAIAIARBAmoiBCABRw0ACwsCQCABIA9PDQAgAUEBaiEEIAogBiADa0ECdGohBUHoMigCACEDQbwyKAIAIQYgDyABa0EBcQRAIAMgASACa0ECdGogBSABQQJ0IgFqKgIAIAEgBmoqAgCUOAIAIAQhAQsgBCAPRg0AA0AgAyABIAJrQQJ0aiAFIAFBAnQiBGoqAgAgBCAGaioCAJQ4AgAgAyABQQFqIgQgAmtBAnRqIAUgBEECdCIEaioCACAEIAZqKgIAlDgCACABQQJqIgEgD0cNAAsLQegyKAIAIRMgDyACayIBQbAyKAIAIgQgAmtJBEAgEyABQQJ0aiAEIA9rQQJ0EAUaC0HsMSgCAEHoMSgCAGtBcEcEQEHcMigCAEG0MigCACAAbEEDdGohFEEAIQEDQCMAQRBrIg8kAEHQMCgCACICQZwxKAIAQZgxKAIAbCIGQQJ0IgBqIQUCQCABRQRAIAZFDQFB6DAoAgAhAEEAIQMDQCACIANBAnQiBGogACADQQN0IgpqIgcqAgAiGSAKIBNqIgoqAgAiGpQgByoCBCIbIAoqAgQiHJSTOAIAIAQgBWogGyAalCAZIByUkjgCACADQQFqIgMgBkcNAAsMAQsgAEHEMCgCACIAaiEEIAFBAWsiA0HsMSgCAEHoMSgCACIKa0EDdUkEQCAPIAogA0EDdGopAgAiKDcDACAPICg3AwhBACELQaAxKAIAIgZBpDEoAgAgBmtBAXVqIQoCQAJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkAgDygCAA4OAAECAwQFBgcICQoLDA0OC0GQMSgCAEGMMSgCACIDa0EDdSIGQQFNBEAgACACKgIAOAIAIAQgBSoCADgCAAwOC0GAMSAGQQEgAiAFIAAgBCADIAMgBkECdGoQFQwNC0GYMSgCACIARQ0MIABBAXECQCAAQQFrIghFBEBBACEDDAELIABBfnEhCUEAIQNBACEEA0AgBiADQQJ0aiILIAIgA0EDdGoiDCoCADgCACALIABBAnQiDmogDCoCBDgCACAGIANBAXIiC0ECdGoiDCACIAtBA3RqIgsqAgA4AgAgDCAOaiALKgIEOAIAIANBAmohAyAEQQJqIgQgCUcNAAsLBEAgBiADQQJ0aiIEIAIgA0EDdGoiAioCADgCACAEIABBAnRqIAIqAgQ4AgALIABBAXECQCAIRQRAQQAhAwwBCyAAQX5xIQZBACEDQQAhBANAIAogA0ECdGoiByAFIANBA3RqIggqAgA4AgAgByAAQQJ0IglqIAgqAgQ4AgAgCiADQQFyIgdBAnRqIgggBSAHQQN0aiIHKgIAOAIAIAggCWogByoCBDgCACADQQJqIQMgBEECaiIEIAZHDQALC0UNDCAKIANBAnRqIgQgBSADQQN0aiICKgIAOAIAIAQgAEECdGogAioCBDgCAAwMC0GYMSgCACIERQ0LIARBAXEgBEEDdCEHAkAgBEEBayIMRQRAQQAhAwwBCyAEQX5xIQ5BACEDQQAhAANAIAYgA0ECdGoiCCACIANBDGxqIgkqAgA4AgAgCCAEQQJ0Ig1qIAkqAgQ4AgAgByAIaiAJKgIIOAIAIAYgA0EBciIJQQJ0aiIIIAIgCUEMbGoiCSoCADgCACAIIA1qIAkqAgQ4AgAgByAIaiAJKgIIOAIAIANBAmohAyAAQQJqIgAgDkcNAAsLBEAgBiADQQJ0aiIAIAIgA0EMbGoiAioCADgCACAAIARBAnRqIAIqAgQ4AgAgACAHaiACKgIIOAIACyAEQQFxAkAgDEUEQEEAIQMMAQsgBEF+cSEJQQAhA0EAIQADQCAKIANBAnRqIgIgBSADQQxsaiIGKgIAOAIAIAIgBEECdCILaiAGKgIEOAIAIAIgB2ogBioCCDgCACAKIANBAXIiBkECdGoiAiAFIAZBDGxqIgYqAgA4AgAgAiALaiAGKgIEOAIAIAIgB2ogBioCCDgCACADQQJqIQMgAEECaiIAIAlHDQALC0UNCyAKIANBAnRqIgAgBSADQQxsaiICKgIAOAIAIAAgBEECdGogAioCBDgCACAAIAdqIAIqAgg4AgAMCwtBmDEoAgAiA0UNCiADQQxsIQkgA0EDdCELQQAhAEEAIQQDQCAGIARBAnRqIgcgAiAEQQR0aiIIKgIAOAIAIAcgA0ECdGogCCoCBDgCACAHIAtqIAgqAgg4AgAgByAJaiAIKgIMOAIAIARBAWoiBCADRw0ACwNAIAogAEECdGoiBCAFIABBBHRqIgIqAgA4AgAgBCADQQJ0aiACKgIEOAIAIAQgC2ogAioCCDgCACAEIAlqIAIqAgw4AgAgAEEBaiIAIANHDQALDAoLQZgxKAIAIgBFDQkgAEEEdCEJIABBDGwhCyAAQQN0IQxBACEDQQAhBANAIAYgBEECdGoiByACIARBFGxqIggqAgA4AgAgByAAQQJ0aiAIKgIEOAIAIAcgDGogCCoCCDgCACAHIAtqIAgqAgw4AgAgByAJaiAIKgIQOAIAIARBAWoiBCAARw0ACwNAIAogA0ECdGoiBCAFIANBFGxqIgIqAgA4AgAgBCAAQQJ0aiACKgIEOAIAIAQgDGogAioCCDgCACAEIAtqIAIqAgw4AgAgBCAJaiACKgIQOAIAIANBAWoiAyAARw0ACwwJC0GcMSgCACIERQ0IQZgxKAIAIgdFDQggBEF+cSENIARBAXEhEEEAIQADQCAKIABBAnQiA2ohCCADIAZqIQkgBSAAIARsQQJ0IgNqIQsgAiADaiEMQQAhA0EAIQ4gBEEBRwRAA0AgCSADIAdsQQJ0IhFqIAwgA0ECdCISaioCADgCACAIIBFqIAsgEmoqAgA4AgAgCSADQQFyIhEgB2xBAnQiEmogDCARQQJ0IhFqKgIAOAIAIAggEmogCyARaioCADgCACADQQJqIQMgDkECaiIOIA1HDQALCyAQBEAgCSADIAdsQQJ0Ig5qIAwgA0ECdCIDaioCADgCACAIIA5qIAMgC2oqAgA4AgALIABBAWoiACAHRw0ACwwIC0GQMSgCAEGMMSgCACICa0EDdSIFQQFNBEAgACAGKgIAOAIAIAQgCioCADgCAAwIC0GAMSAFQQEgBiAKIAAgBCACIAIgBUECdGoQFQwHCyAKIA8oAgRBAnQiAmohBSACIAZqIQMgAiAEaiEEIAAgAmohAEGQMSgCAEGMMSgCACICa0EDdSIGQQFNBEAgACADKgIAOAIAIAQgBSoCADgCAAwHC0GAMSAGQQEgAyAFIAAgBCACIAIgBkECdGoQFQwGC0GYMSgCACICQZwxKAIAQQFrbCIFRQ0FIAQgAkECdCICaiEDIAAgAmohAkHEMSgCACEGQbgxKAIAIQpBACEAA0AgAiAAQQJ0IgRqIgcgBCAKaioCACIZIAcqAgAiGpQgBCAGaioCACIbIAMgBGoiBCoCACIclJM4AgAgBCAbIBqUIBwgGZSSOAIAIABBAWoiACAFRw0ACwwFC0GYMSgCACIFRQ0EIAQgBUECdCICaiEGIAAgAmohCkEAIQMDQCAGIANBAnQiAmoiByoCACEZIAIgBGoiCCoCACEaIAAgAmoiCSACIApqIgIqAgAiGyAJKgIAIhySOAIAIAggGSAakjgCACACIBwgG5M4AgAgByAaIBmTOAIAIANBAWoiAyAFRw0ACwwEC0GYMSgCACIFRQ0DIAQgBUEDdCICaiEGIAAgAmohCiAEIAVBAnQiAmohByAAIAJqIQhBACEDA0AgBiADQQJ0IgJqIgkqAgAhGSACIAdqIgsqAgAhGiACIARqIgwqAgAhGyAAIAJqIg4gAiAIaiINKgIAIhwgDioCACIdkiACIApqIgIqAgAiHpI4AgAgDCAZIBogG5KSOAIAIA0gHSAcQwAAAL+UkiIdIBpD17Ndv5QiH5MgHkMAAAC/lCIgkiAZQ9ezXb+UIiGSOAIAIAsgGyAaQwAAAL+UkiIaIBxD17Ndv5QiG5IgHkPXs12/lCIckyAZQwAAAL+UIhmSOAIAIAIgHSAfkiAgkiAhkzgCACAJIBogG5MgHJIgGZI4AgAgA0EBaiIDIAVHDQALDAMLQZgxKAIAIgVFDQIgBCAFQQxsIgJqIQYgACACaiEKIAQgBUEDdCICaiEHIAAgAmohCCAEIAVBAnQiAmohCSAAIAJqIQtBACEDA0AgBiADQQJ0IgJqIgwqAgAhGSACIAlqIg4qAgAhGiACIAdqIg0qAgAhGyACIARqIhAqAgAhHCAAIAJqIhEgAiAKaiISKgIAIh4gAiALaiIVKgIAIh2SIh8gAiAIaiICKgIAIiAgESoCACIhkiIkkjgCACAQIBkgGpIiIiAbIBySIiOSOAIAIBUgGiAZkyIZICEgIJMiGpI4AgAgDiAcIBuTIhsgHSAekyIckzgCACACICQgH5M4AgAgDSAjICKTOAIAIBIgGiAZkzgCACAMIBwgG5I4AgAgA0EBaiIDIAVHDQALDAILQQAhA0GYMSgCACIFBEAgBCAFQQR0IgJqIQYgACACaiEKIAQgBUEMbCICaiEHIAAgAmohCCAEIAVBA3QiAmohCSAAIAJqIQsgBCAFQQJ0IgJqIQwgACACaiEOA0AgBCADQQJ0IgJqIg0qAgAhGSACIAdqIhAqAgAhGiACIAlqIhEqAgAhGyACIAZqIhIqAgAhHCACIAxqIhUqAgAhHiAAIAJqIhYgAiAIaiIXKgIAIiIgAiALaiIYKgIAIiOSIh0gFioCACIfkiACIApqIhYqAgAiJSACIA5qIgIqAgAiJpIiIJI4AgAgDSAZIBogG5IiIZIgHCAekiIkkjgCACACIB8gIEN6N54+lCAdQ70bTz+Uk5IiJyAaIBuTIhpDGHkWv5QgHCAekyIbQ3F4cz+UkyIckjgCACAVIBkgJEN6N54+lCAhQ70bTz+Uk5IiHiAjICKTIiJDGHkWv5QgJiAlkyIjQ3F4cz+UkyIlkjgCACAYIB8gHUN6N54+lCAgQ70bTz+Uk5IiHSAbQxh5Fr+UIBpDcXhzP5SSIhqSOAIAIBEgGSAhQ3o3nj6UICRDvRtPP5STkiIZICNDGHkWv5QgIkNxeHM/lJIiG5I4AgAgFyAdIBqTOAIAIBAgGSAbkzgCACAWICcgHJM4AgAgEiAeICWTOAIAIANBAWoiAyAFRw0ACwsMAQtBACEDQQAhAgJAQZgxKAIAIgVFDQBB3DEoAgAiBkGcMSgCACIHQQJ0aiEKIAdBAk8EQCAHQX5xIQwgB0EBcSEOA0AgBCALQQJ0IgJqIQggACACaiEJQwAAAAAhGUEAIQNDAAAAACEaQQAhAgNAIAYgA0ECdCINaiAJIAMgBWxBAnQiEGoqAgAiGzgCACAKIA1qIAggEGoqAgAiHDgCACAGIANBAXIiDUECdCIQaiAJIAUgDWxBAnQiDWoqAgAiHjgCACAKIBBqIAggDWoqAgAiHTgCACAeIBsgGpKSIRogHSAcIBmSkiEZIANBAmohAyACQQJqIgIgDEcNAAsgDgRAIAYgA0ECdCICaiAJIAMgBWxBAnQiA2oqAgAiGzgCACACIApqIAMgCGoqAgAiHDgCACAbIBqSIRogHCAZkiEZCyAJIBo4AgAgCCAZOAIAQdAxKAIAIQ1BASECA0AgCioCACEZIAYqAgAhGkEBIQMDQCAGIANBAnQiEGoqAgAiGyANIAIgA2wgB3BBA3RqIhEqAgQiHJQgGZIgCiAQaioCACIeIBEqAgAiHZSSIRkgGyAdlCAakiAcIB6UkyEaIANBAWoiAyAHRw0ACyAJIAIgBWxBAnQiA2ogGjgCACADIAhqIBk4AgAgAkEBaiICIAdHDQALIAtBAWoiCyAFRw0ACwwBCyAHBEAgBUEBRwRAIAVBfnEhCANAIAYgACADQQJ0IgdqIgkqAgAiGTgCACAKIAQgB2oiCyoCACIaOAIAIAkgGTgCACALIBo4AgAgBiAAIAdBBHIiB2oiCSoCACIZOAIAIAogBCAHaiIHKgIAIho4AgAgCSAZOAIAIAcgGjgCACADQQJqIQMgAkECaiICIAhHDQALCyAFQQFxRQ0BIAYgACADQQJ0IgJqIgAqAgAiGTgCACAKIAIgBGoiBCoCACIaOAIAIAAgGTgCACAEIBo4AgAMAQsgBUEETwRAIAVBfHEhB0EAIQoDQCAAIANBAnQiBmpBADYCACAEIAZqQQA2AgAgACAGQQRyIghqQQA2AgAgBCAIakEANgIAIAAgBkEIciIIakEANgIAIAQgCGpBADYCACAAIAZBDHIiBmpBADYCACAEIAZqQQA2AgAgA0EEaiEDIApBBGoiCiAHRw0ACwsgBUEDcSIFRQ0AA0AgACADQQJ0IgZqQQA2AgAgBCAGakEANgIAIANBAWohAyACQQFqIgIgBUcNAAsLCwwBCyAGQQF2IQJBACEDA0AgFCADQQN0IgVqIgogBCAGIANBf3NqIgdBAnQiCGoqAgAiGSAEIANBAnQiCWoqAgAiGpJDAAAAP5QiG0HcMCgCACAFaiIFKgIAIhyUIAAgCWoqAgAiHiAAIAhqKgIAIh2TQwAAAD+UIh8gBSoCBCIglJIiISAaIBmTQwAAAD+UIhmSOAIEIAogHyAclCAbICCUkyIaIB0gHpJDAAAAP5QiG5I4AgAgFCAHQQN0aiIFICEgGZM4AgQgBSAbIBqTOAIAIAIgA0cgA0EBaiEDDQALCyAPQRBqJAAgAUEBaiIBQewxKAIAQegxKAIAa0EDdUECakkNAAsLC+IIAwd8B38BfUG4MiAANgIAAkAgAUUNAEHYMkGsMigCACIJQQF2Igo2AgBB1DIgCjYCAAJAAkACQCABQQFrDgIAAQILIAm4IgdEjuM4juM45j+iIAC4oyICmiIDEBEhBCACRAAAAAAAACLAohARIQUgCUEATA0BRAAAAAAAAPA/IAejIQdEAAAAAAAA8D9EAAAAAAAA8D8gAkQAAAAAAAAQwKIQESAEIAUgBKCjIgIgAqCioaMhBUG8MigCACEKQQAhAQNAIAFBAXRBAXK4IAeiIgREAAAAAAAACMCgIgYgBqIgA6IQESEGIAREAAAAAAAA8D+gIgggCKIgA6IQESEIIAogAUECdGogBEQAAAAAAADwv6AiBCAEoiADohARIAYgCKAgAqKhIAWitjgCACABQQFqIgEgCUcNAAsMAQtEAAAAAAAAAEBEAAAAAAAAIEAgCbgiBSAAuKMiAkQAAAAAAAAIQKAiBCAEoqMgAqBEAAAAAAAAAABEAAAAAAAACEAgAqEiAiACRAAAAAAAAAAAYxtEAAAAAAAA0D+ioCICIAJEAAAAAAAAAEBjGyICIAKiRAAAAAAAANA/okQAAAAAAADwv6CfRBgtRFT7IQlAoiIHIAeiIQZEAAAAAAAA8D8hAkQAAAAAAAAAACEEA0AgBCACoCEEIAYgAqIgA0QAAAAAAADwP6AiAyADokQAAAAAAAAQQKKjIgJELUMc6+I2Gj9kDQALIAlBAEwNAEQAAAAAAADwPyAEoyEGRAAAAAAAAPA/IAWjIQVBvDIoAgAhCkEAIQEDQEQAAAAAAADwPyABQQF0QQFyuCAFokQAAAAAAADwv6AiAyADoqGfIAeiIgMgA6IhCEQAAAAAAAAAACEDRAAAAAAAAPA/IQJEAAAAAAAAAAAhBANAIAQgAqAhBCAIIAKiIANEAAAAAAAA8D+gIgMgA6JEAAAAAAAAEECioyICRC1DHOviNho/ZA0ACyAKIAFBAnRqIAQgBqK2OAIAIAFBAWoiASAJRw0ACwsgAEEASgRAQbwyKAIAIQtBACEKA0BEAAAAAAAAAAAhAyAJIAoiAUoEQANAIAMgCyABQQJ0aioCACIQIBCUu6AhAyAAIAFqIgEgCUgNAAtEAAAAAAAA8D8gA5+jIQMgCiEBA0AgCyABQQJ0aiIMIAwqAgC7IAOitjgCACAAIAFqIgEgCUgNAAsLIApBAWoiCiAARw0ACwsgCUUNAEHIMigCACEAQbwyKAIAIQtBACEBIAlBBE8EQCAJQXxxIQ9BACEKA0AgACABQQJ0IgxqIAsgDGoqAgA4AgAgACAMQQRyIg1qIAsgDWoqAgA4AgAgACAMQQhyIg1qIAsgDWoqAgA4AgAgACAMQQxyIgxqIAsgDGoqAgA4AgAgAUEEaiEBIApBBGoiCiAPRw0ACwsgCUEDcSIKRQ0AA0AgACABQQJ0IglqIAkgC2oqAgA4AgAgAUEBaiEBIA5BAWoiDiAKRw0ACwsLgwcBBn9B0DMoAgAiA0HIMygCACICa0EcbSAATwRAAkBBzDMoAgAgAmtBHG0iBSAAIAAgBUsbIgRFDQACQCAEQQNxIgZFBEAgBCEDDAELIAQhAwNAIAIgASkCADcCACACIAEoAhg2AhggAiABKQIQNwIQIAIgASkCCDcCCCADQQFrIQMgAkEcaiECIAdBAWoiByAGRw0ACwsgBEEESQ0AA0AgAiABKQIANwIAIAIgASgCGDYCGCACIAEpAhA3AhAgAiABKQIINwIIIAIgASgCGDYCNCACIAEpAhA3AiwgAiABKQIINwIkIAIgASkCADcCHCACIAEoAhg2AlAgAiABKQIQNwJIIAJBQGsgASkCCDcCACACIAEpAgA3AjggAiABKQIANwJUIAIgASkCCDcCXCACIAEpAhA3AmQgAiABKAIYNgJsIAJB8ABqIQIgA0EEayIDDQALCyAAIAVLBEBBzDMoAgAiAiAAIAVrQRxsaiEAA0AgAiABKQIANwIAIAIgASgCGDYCGCACIAEpAhA3AhAgAiABKQIINwIIIAJBHGoiAiAARw0AC0HMMyAANgIADwtBzDNByDMoAgAgAEEcbGo2AgAPCyACBEBBzDMgAjYCACACEARB0DNBADYCAEHIM0IANwIAQQAhAwsCQCAAQcqkkskATw0AQcmkkskAIANBHG0iA0EBdCIEIAAgACAESRsgA0GkkskkTxsiA0HKpJLJAE8NAEHMMyADQRxsIgMQByIENgIAQcgzIAQ2AgBB0DMgAyAEajYCACAEIQIgAEEcbCIAQRxrIgVBHG4iA0EDcUEDRwRAIANBAWpBA3EhBkEAIQMDQCACIAEpAgA3AgAgAiABKAIYNgIYIAIgASkCEDcCECACIAEpAgg3AgggAkEcaiECIANBAWoiAyAGRw0ACwsgACAEaiEAIAVB1ABPBEADQCACIAEpAgA3AgAgAiABKAIYNgIYIAIgASkCEDcCECACIAEpAgg3AgggAiABKAIYNgI0IAIgASkCEDcCLCACIAEpAgg3AiQgAiABKQIANwIcIAIgASgCGDYCUCACIAEpAhA3AkggAkFAayABKQIINwIAIAIgASkCADcCOCACIAEpAgA3AlQgAiABKQIINwJcIAIgASkCEDcCZCACIAEoAhg2AmwgAkHwAGoiAiAARw0ACwtBzDMgADYCAA8LEA0AC40dAw5/AX0CfCAAQTBqIgMgAUEBdiIJIgU2AiggA0EBNgIkIAMoAmgiAiADKAJsRwRAIAMgAjYCbAsgAygCXCICIAMoAmBHBEAgAyACNgJgCyADKAJ0IgIgAygCeEcEQCADIAI2AngLAkAgBUUNAEEBIQQCQCAFQQFxDQAgBSECA0AgAkEBTSAEQR9LcQ0BIAMgAkEBdiIGNgIoIAMgBEEBdCIENgIkIAJBAnEgBiECRQ0ACwsCQCADKAIwIAMoAiwiBmtBA3UiAiAFSQRAIANBLGogBSACaxAIIAMoAiQhBAwBCyACIAVNDQAgAyAGIAVBA3RqNgIwCyADQQxqIQUCQCAEQQNsIgZBAnYiAiADKAIQIAMoAgwiCGtBA3UiB0sEQCAFIAIgB2sQCAwBCyACIAdPDQAgAyAIIAJBA3RqNgIQCwJAIAZBBEkNAEEBIAIgAkEBTRsiB0EBcSAEuCERQQAhAiAGQQhPBEBEAAAAAAAA8D8gEaMhEiAHQf7///8DcSEHQQAhBgNAIAUoAgAgAkEDdGoiCiACuEQYLURU+yEZwKIgEqK2IhAQCTgCBCAKIBAQCjgCACAFKAIAIAJBAXIiCkEDdGoiCyAKuEQYLURU+yEZwKIgEqK2IhAQCTgCBCALIBAQCjgCACACQQJqIQIgBkECaiIGIAdHDQALC0UNACAFKAIAIAJBA3RqIgUgArhEGC1EVPshGcCiIBGjtiIQEAk4AgQgBSAQEAo4AgALAkAgAygCHCADKAIYIgVrQQN1IgIgBEkEQCADQRhqIAQgAmsQCAwBCyACIARNDQAgAyAFIARBA3RqNgIcCwJAIAMoAgQgAygCACIFa0EDdSICIARJBEAgAyAEIAJrEAgMAQsgAiAESwRAIAMgBSAEQQN0ajYCBAsLAkAgAygCJCICIAMoAihBAWtsIgQgAygCPCADKAI4IgZrQQN1IgVLBEAgA0E4aiAEIAVrEAggAygCJCICIAMoAihBAWtsIQQMAQsgBCAFTw0AIAMgBiAEQQN0ajYCPAsgA0HEAGohBwJAIAMoAkggAygCRCIGa0ECdSIFIARJBEAgByAEIAVrEAYgAygCJCICIAMoAihBAWtsIQQMAQsgBCAFTw0AIAMgBiAEQQJ0ajYCSAsgA0HQAGohBQJAIAMoAlQgAygCUCIIa0ECdSIGIARJBEAgBSAEIAZrEAYgAygCJCECDAELIAQgBk8NACADIAggBEECdGo2AlQLAkAgAkUNACADKAIoIgRBAkkNAEEAIQYDQCAEQQJPBEAgBrhEGC1EVPshGcCiIRFBASECA0AgAygCOCAGQQN0aiADKAIkIgggAkEBa2xBA3RqIgogESACuKIgCLggBLiio7YiEBAJOAIEIAogEBAKOAIAIAJBAWoiAiADKAIoIgRJDQALIAMoAiQhAgsgBkEBaiIGIAJJDQALCwJAIAMoAjwiAiADKAI4IgRGDQBBASACIARrQQN1IgYgBkEBTRsiCEEBcSAFKAIAIQUgBygCACEHQQAhAiAGQQJPBEAgCEF+cSEIQQAhBgNAIAcgAkECdCILaiAEIAJBA3RqIg0qAgA4AgAgBSALaiANKgIEOAIAIAcgAkEBciILQQJ0Ig1qIAQgC0EDdGoiCyoCADgCACAFIA1qIAsqAgQ4AgAgAkECaiECIAZBAmoiBiAIRw0ACwtFDQAgByACQQJ0IgZqIAQgAkEDdGoiAioCADgCACAFIAZqIAIqAgQ4AgALIAMoAnwhBCADKAJ4IQICQAJAIAMoAigiBUECSQRAIAIgBEkEQCACQgA3AgAgAyACQQhqNgJ4DAQLIAIgAygCdCIFa0EDdSIHQQFqIgZBgICAgAJPDQFB/////wEgBCAFayIEQQJ1IgggBiAGIAhJGyAEQfj///8HTxsiBgR/IAZBgICAgAJPDQMgBkEDdBAHBUEACyIIIAdBA3RqIgRCADcCACAEQQhqIQcgAiAFRwRAA0AgBEEIayIEIAJBCGsiAikCADcCACACIAVHDQALIAMoAnQhBQsgAyAIIAZBA3RqNgJ8IAMgBzYCeCADIAQ2AnQgBQRAIAUQBAsgAyAHNgJ4DAMLQQRBA0ECQQFBBSAFQQJGIgobIAVBA0YiCxsgBUEERiINGyAFQQVGIg8bIQgCQCACIARJBEAgAiAIrTcCACACQQhqIQQMAQsgAiADKAJ0IgZrQQN1IgxBAWoiBUGAgICAAk8NAUH/////ASAEIAZrIgRBAnUiByAFIAUgB0kbIARB+P///wdPGyIHBH8gB0GAgICAAk8NAyAHQQN0EAcFQQALIg4gDEEDdGoiBSAIrTcCACAFQQhqIQQgAiAGRwRAA0AgBUEIayIFIAJBCGsiAikCADcCACACIAZHDQALIAMoAnQhBgsgAyAOIAdBA3RqNgJ8IAMgBDYCeCADIAU2AnQgBkUNACAGEAQLIAMgBDYCeAJAIAMoAnwiBSAESwRAIARCBjcCACAEQQhqIQIMAQsgBCADKAJ0IgZrQQN1IghBAWoiAkGAgICAAk8NAUH/////ASAFIAZrIgVBAnUiByACIAIgB0kbIAVB+P///wdPGyIHBH8gB0GAgICAAk8NAyAHQQN0EAcFQQALIgwgCEEDdGoiBUIGNwIAIAVBCGohAiAEIAZHBEADQCAFQQhrIgUgBEEIayIEKQIANwIAIAQgBkcNAAsgAygCdCEGCyADIAwgB0EDdGo2AnwgAyACNgJ4IAMgBTYCdCAGRQ0AIAYQBAsgAyACNgJ4QQEhBiADKAIoQQFLBEADQCADKAIkIAZsIQggAwJ/IAMoAnwiByACSwRAIAIgCK1CIIZCB4Q3AgAgAkEIagwBCyACIAMoAnQiBWtBA3UiDEEBaiIEQYCAgIACTw0DQf////8BIAcgBWsiB0ECdSIOIAQgBCAOSRsgB0H4////B08bIgcEfyAHQYCAgIACTw0FIAdBA3QQBwVBAAsiDiAMQQN0aiIEIAitQiCGQgeENwIAIARBCGohCCACIAVHBEADQCAEQQhrIgQgAkEIayICKQIANwIAIAIgBUcNAAsgAygCdCEFCyADIA4gB0EDdGo2AnwgAyAINgJ4IAMgBDYCdCAFBEAgBRAECyAICyICNgJ4IAZBAWoiBiADKAIoSQ0ACwsCQCADKAJ8IgUgAksEQCACQgg3AgAgAkEIaiEEDAELIAIgAygCdCIGa0EDdSIIQQFqIgRBgICAgAJPDQFB/////wEgBSAGayIFQQJ1IgcgBCAEIAdJGyAFQfj///8HTxsiBwR/IAdBgICAgAJPDQMgB0EDdBAHBUEACyIMIAhBA3RqIgVCCDcCACAFQQhqIQQgAiAGRwRAA0AgBUEIayIFIAJBCGsiAikCADcCACACIAZHDQALIAMoAnQhBgsgAyAMIAdBA3RqNgJ8IAMgBDYCeCADIAU2AnQgBkUNACAGEAQLQQxBC0EKQQlBDSAKGyALGyANGyAPGyEHIAMgBDYCeAJAIAMoAnwiBiAESwRAIAQgB603AgAgBEEIaiEGDAELIAQgAygCdCIFa0EDdSIKQQFqIgJBgICAgAJPDQFB/////wEgBiAFayIGQQJ1IgggAiACIAhJGyAGQfj///8HTxsiCAR/IAhBgICAgAJPDQMgCEEDdBAHBUEACyILIApBA3RqIgIgB603AgAgAkEIaiEGIAQgBUcEQANAIAJBCGsiAiAEQQhrIgQpAgA3AgAgBCAFRw0ACyADKAJ0IQULIAMgCyAIQQN0ajYCfCADIAY2AnggAyACNgJ0IAVFDQAgBRAECyADIAY2AnggB0ENRw0CAkAgAygCKCIEIAMoAmwgAygCaCIFa0EDdSICSwRAIANB6ABqIAQgAmsQCCADKAIoIQQMAQsgAiAETQ0AIAMgBSAEQQN0ajYCbAsCQCADKAJgIAMoAlwiBWtBA3UiAiAESQRAIANB3ABqIAQgAmsQCCADKAIoIQQMAQsgAiAETQ0AIAMgBSAEQQN0ajYCYAsgBEUNAkEAIQIDQCADKAJcIAJBA3RqIgUgArhEGC1EVPshGcCiIAS4o7YiEBAJOAIEIAUgEBAKOAIAIAJBAWoiAiADKAIoIgRJDQALDAILEA0ACxAOAAsCQCAAKAIEIAAoAgAiA2tBA3UiAiAJSQRAIAAgCSACaxAIDAELIAIgCU0NACAAIAMgCUEDdGo2AgQLAkAgACgCECAAKAIMIgNrQQN1IgIgCUkEQCAAQQxqIAkgAmsQCAwBCyACIAlNDQAgACADIAlBA3RqNgIQCyABQQJ2IgZBAWohAwJAIAYgACgCHCICIAAoAhgiBWtBA3UiBE8EQCAAQRhqIAMgBGsQCCAAKAIYIQUgACgCHCECDAELIAMgBE8NACAAIAUgA0EDdGoiAjYCHAsgAiAFRwRARAAAAAAAAPA/IAG4oyERQQAhAgNAIAUgAkEDdGoiAyACuEQYLURU+yEZwKJEGC1EVPshCcCgIBGiRBgtRFT7Ifm/oLYiEBAJOAIEIAMgEBAKOAIAIAJBAWoiAiAAKAIcIAAoAhgiBWtBA3VJDQALCyAAQSRqIQMCQCAAKAIoIAAoAiQiBGtBA3UiAiAJSQRAIAMgCSACaxAIDAELIAIgCU0NACAAIAQgCUEDdGo2AigLAkAgAUECSQ0AIAG4IRFBACECIAlBAUcEQEQAAAAAAADwPyARoyESIAlB/v///wdxIQRBACEAA0AgAygCACACQQN0aiIFIAK4RBgtRFT7IRnAoiASorYiEBAJOAIEIAUgEBAKOAIAIAMoAgAgAkEBciIFQQN0aiIGIAW4RBgtRFT7IRnAoiASorYiEBAJOAIEIAYgEBAKOAIAIAJBAmohAiAAQQJqIgAgBEcNAAsLIAFBAnFFDQAgAygCACACQQN0aiIAIAK4RBgtRFT7IRnAoiARo7YiEBAJOAIEIAAgEBAKOAIACwsIAEGsMigCAAu1BQEJfwJAIAAgAWxBAXQiAkG8NCgCAEG4NCgCACIIa0ECdSIDSwRAQbg0IAIgA2sQBkG4NCgCACEIDAELIAIgA08NAEG8NCAIIAJBAnRqNgIAC0HENCgCACICQcg0KAIARwRAQcg0IAI2AgALQdA0KAIAIgJB1DQoAgBHBEBB1DQgAjYCAAsCQAJAIABBAEoEQANAIAggASAJbEECdGohBgJAQcg0KAIAIgJBzDQoAgAiBEkEQCACIAY2AgAgAkEEaiEGDAELIAJBxDQoAgAiA2tBAnUiCkEBaiIFQYCAgIAETw0DQf////8DIAQgA2siBEEBdSIHIAUgBSAHSRsgBEH8////B08bIgQEfyAEQYCAgIAETw0FIARBAnQQBwVBAAsiByAKQQJ0aiIFIAY2AgAgBUEEaiEGIAIgA0cEQANAIAVBBGsiBSACQQRrIgIoAgA2AgAgAiADRw0AC0HENCgCACEDC0HMNCAHIARBAnRqNgIAQcg0IAY2AgBBxDQgBTYCACADRQ0AIAMQBAtByDQgBjYCACAIIAAgCWogAWxBAnRqIQYCQEHUNCgCACICQdg0KAIAIgRJBEAgAiAGNgIAIAJBBGohBgwBCyACQdA0KAIAIgNrQQJ1IgpBAWoiBUGAgICABE8NA0H/////AyAEIANrIgRBAXUiByAFIAUgB0kbIARB/P///wdPGyIEBH8gBEGAgICABE8NBSAEQQJ0EAcFQQALIgcgCkECdGoiBSAGNgIAIAVBBGohBiACIANHBEADQCAFQQRrIgUgAkEEayICKAIANgIAIAIgA0cNAAtB0DQoAgAhAwtB2DQgByAEQQJ0ajYCAEHUNCAGNgIAQdA0IAU2AgAgA0UNACADEAQLQdQ0IAY2AgAgCUEBaiIJIABHDQALCyAIDwsQDQALEA4ACwUAEA4AC9onAQt/IwBBEGsiCiQAAkACQAJAAkACQAJAAkACQAJAAkAgAEH0AU0EQEHgNCgCACIEQRAgAEELakH4A3EgAEELSRsiBkEDdiIAdiIBQQNxBEACQCABQX9zQQFxIABqIgJBA3QiAUGINWoiACABQZA1aigCACIBKAIIIgVGBEBB4DQgBEF+IAJ3cTYCAAwBCyAFIAA2AgwgACAFNgIICyABQQhqIQAgASACQQN0IgJBA3I2AgQgASACaiIBIAEoAgRBAXI2AgQMCwsgBkHoNCgCACIITQ0BIAEEQAJAQQIgAHQiAkEAIAJrciABIAB0cWgiAUEDdCIAQYg1aiICIABBkDVqKAIAIgAoAggiBUYEQEHgNCAEQX4gAXdxIgQ2AgAMAQsgBSACNgIMIAIgBTYCCAsgACAGQQNyNgIEIAAgBmoiByABQQN0IgEgBmsiBUEBcjYCBCAAIAFqIAU2AgAgCARAIAhBeHFBiDVqIQFB9DQoAgAhAgJ/IARBASAIQQN2dCIDcUUEQEHgNCADIARyNgIAIAEMAQsgASgCCAshAyABIAI2AgggAyACNgIMIAIgATYCDCACIAM2AggLIABBCGohAEH0NCAHNgIAQeg0IAU2AgAMCwtB5DQoAgAiC0UNASALaEECdEGQN2ooAgAiAigCBEF4cSAGayEDIAIhAQNAAkAgASgCECIARQRAIAEoAhQiAEUNAQsgACgCBEF4cSAGayIBIAMgASADSSIBGyEDIAAgAiABGyECIAAhAQwBCwsgAigCGCEJIAIgAigCDCIARwRAIAIoAggiASAANgIMIAAgATYCCAwKCyACKAIUIgEEfyACQRRqBSACKAIQIgFFDQMgAkEQagshBQNAIAUhByABIgBBFGohBSAAKAIUIgENACAAQRBqIQUgACgCECIBDQALIAdBADYCAAwJC0F/IQYgAEG/f0sNACAAQQtqIgFBeHEhBkHkNCgCACIHRQ0AQR8hCEEAIAZrIQMgAEH0//8HTQRAIAZBJiABQQh2ZyIAa3ZBAXEgAEEBdGtBPmohCAsCQAJAAkAgCEECdEGQN2ooAgAiAUUEQEEAIQAMAQtBACEAIAZBGSAIQQF2a0EAIAhBH0cbdCECA0ACQCABKAIEQXhxIAZrIgQgA08NACABIQUgBCIDDQBBACEDIAEhAAwDCyAAIAEoAhQiBCAEIAEgAkEddkEEcWooAhAiAUYbIAAgBBshACACQQF0IQIgAQ0ACwsgACAFckUEQEEAIQVBAiAIdCIAQQAgAGtyIAdxIgBFDQMgAGhBAnRBkDdqKAIAIQALIABFDQELA0AgACgCBEF4cSAGayICIANJIQEgAiADIAEbIQMgACAFIAEbIQUgACgCECIBBH8gAQUgACgCFAsiAA0ACwsgBUUNACADQeg0KAIAIAZrTw0AIAUoAhghCCAFIAUoAgwiAEcEQCAFKAIIIgEgADYCDCAAIAE2AggMCAsgBSgCFCIBBH8gBUEUagUgBSgCECIBRQ0DIAVBEGoLIQIDQCACIQQgASIAQRRqIQIgACgCFCIBDQAgAEEQaiECIAAoAhAiAQ0ACyAEQQA2AgAMBwsgBkHoNCgCACIFTQRAQfQ0KAIAIQACQCAFIAZrIgFBEE8EQCAAIAZqIgIgAUEBcjYCBCAAIAVqIAE2AgAgACAGQQNyNgIEDAELIAAgBUEDcjYCBCAAIAVqIgEgASgCBEEBcjYCBEEAIQJBACEBC0HoNCABNgIAQfQ0IAI2AgAgAEEIaiEADAkLIAZB7DQoAgAiAkkEQEHsNCACIAZrIgE2AgBB+DRB+DQoAgAiACAGaiICNgIAIAIgAUEBcjYCBCAAIAZBA3I2AgQgAEEIaiEADAkLQQAhACAGQS9qIgMCf0G4OCgCAARAQcA4KAIADAELQcQ4Qn83AgBBvDhCgKCAgICABDcCAEG4OCAKQQxqQXBxQdiq1aoFczYCAEHMOEEANgIAQZw4QQA2AgBBgCALIgFqIgRBACABayIHcSIBIAZNDQhBmDgoAgAiBQRAQZA4KAIAIgggAWoiCSAITQ0JIAUgCUkNCQsCQEGcOC0AAEEEcUUEQAJAAkACQAJAQfg0KAIAIgUEQEGgOCEAA0AgACgCACIIIAVNBEAgBSAIIAAoAgRqSQ0DCyAAKAIIIgANAAsLQQAQECICQX9GDQMgASEEQbw4KAIAIgBBAWsiBSACcQRAIAEgAmsgAiAFakEAIABrcWohBAsgBCAGTQ0DQZg4KAIAIgAEQEGQOCgCACIFIARqIgcgBU0NBCAAIAdJDQQLIAQQECIAIAJHDQEMBQsgBCACayAHcSIEEBAiAiAAKAIAIAAoAgRqRg0BIAIhAAsgAEF/Rg0BIAZBMGogBE0EQCAAIQIMBAtBwDgoAgAiAiADIARrakEAIAJrcSICEBBBf0YNASACIARqIQQgACECDAMLIAJBf0cNAgtBnDhBnDgoAgBBBHI2AgALIAEQECECQQAQECEAIAJBf0YNBSAAQX9GDQUgACACTQ0FIAAgAmsiBCAGQShqTQ0FC0GQOEGQOCgCACAEaiIANgIAQZQ4KAIAIABJBEBBlDggADYCAAsCQEH4NCgCACIDBEBBoDghAANAIAIgACgCACIBIAAoAgQiBWpGDQIgACgCCCIADQALDAQLQfA0KAIAIgBBACAAIAJNG0UEQEHwNCACNgIAC0EAIQBBpDggBDYCAEGgOCACNgIAQYA1QX82AgBBhDVBuDgoAgA2AgBBrDhBADYCAANAIABBA3QiAUGQNWogAUGINWoiBTYCACABQZQ1aiAFNgIAIABBAWoiAEEgRw0AC0HsNCAEQShrIgBBeCACa0EHcSIBayIFNgIAQfg0IAEgAmoiATYCACABIAVBAXI2AgQgACACakEoNgIEQfw0Qcg4KAIANgIADAQLIAIgA00NAiABIANLDQIgACgCDEEIcQ0CIAAgBCAFajYCBEH4NCADQXggA2tBB3EiAGoiATYCAEHsNEHsNCgCACAEaiICIABrIgA2AgAgASAAQQFyNgIEIAIgA2pBKDYCBEH8NEHIOCgCADYCAAwDC0EAIQAMBgtBACEADAQLQfA0KAIAIAJLBEBB8DQgAjYCAAsgAiAEaiEFQaA4IQACQANAIAUgACgCACIBRwRAIAAoAggiAA0BDAILCyAALQAMQQhxRQ0DC0GgOCEAA0ACQCAAKAIAIgEgA00EQCADIAEgACgCBGoiBUkNAQsgACgCCCEADAELC0HsNCAEQShrIgBBeCACa0EHcSIBayIHNgIAQfg0IAEgAmoiATYCACABIAdBAXI2AgQgACACakEoNgIEQfw0Qcg4KAIANgIAIAMgBUEnIAVrQQdxakEvayIAIAAgA0EQakkbIgFBGzYCBCABQag4KQIANwIQIAFBoDgpAgA3AghBqDggAUEIajYCAEGkOCAENgIAQaA4IAI2AgBBrDhBADYCACABQRhqIQADQCAAQQc2AgQgAEEIaiAAQQRqIQAgBUkNAAsgASADRg0AIAEgASgCBEF+cTYCBCADIAEgA2siAkEBcjYCBCABIAI2AgACfyACQf8BTQRAIAJBeHFBiDVqIQACf0HgNCgCACIBQQEgAkEDdnQiAnFFBEBB4DQgASACcjYCACAADAELIAAoAggLIQEgACADNgIIIAEgAzYCDEEMIQJBCAwBC0EfIQAgAkH///8HTQRAIAJBJiACQQh2ZyIAa3ZBAXEgAEEBdGtBPmohAAsgAyAANgIcIANCADcCECAAQQJ0QZA3aiEBAkACQEHkNCgCACIFQQEgAHQiBHFFBEBB5DQgBCAFcjYCACABIAM2AgAMAQsgAkEZIABBAXZrQQAgAEEfRxt0IQAgASgCACEFA0AgBSIBKAIEQXhxIAJGDQIgAEEddiEFIABBAXQhACABIAVBBHFqIgQoAhAiBQ0ACyAEIAM2AhALIAMgATYCGEEIIQIgAyIBIQBBDAwBCyABKAIIIgAgAzYCDCABIAM2AgggAyAANgIIQQAhAEEYIQJBDAsgA2ogATYCACACIANqIAA2AgALQew0KAIAIgAgBk0NAEHsNCAAIAZrIgE2AgBB+DRB+DQoAgAiACAGaiICNgIAIAIgAUEBcjYCBCAAIAZBA3I2AgQgAEEIaiEADAQLQdw0QTA2AgBBACEADAMLIAAgAjYCACAAIAAoAgQgBGo2AgQgAkF4IAJrQQdxaiIIIAZBA3I2AgQgAUF4IAFrQQdxaiIEIAYgCGoiA2shBwJAQfg0KAIAIARGBEBB+DQgAzYCAEHsNEHsNCgCACAHaiIANgIAIAMgAEEBcjYCBAwBC0H0NCgCACAERgRAQfQ0IAM2AgBB6DRB6DQoAgAgB2oiADYCACADIABBAXI2AgQgACADaiAANgIADAELIAQoAgQiAEEDcUEBRgRAIABBeHEhCSAEKAIMIQICQCAAQf8BTQRAIAQoAggiASACRgRAQeA0QeA0KAIAQX4gAEEDdndxNgIADAILIAEgAjYCDCACIAE2AggMAQsgBCgCGCEGAkAgAiAERwRAIAQoAggiACACNgIMIAIgADYCCAwBCwJAIAQoAhQiAAR/IARBFGoFIAQoAhAiAEUNASAEQRBqCyEBA0AgASEFIAAiAkEUaiEBIAAoAhQiAA0AIAJBEGohASACKAIQIgANAAsgBUEANgIADAELQQAhAgsgBkUNAAJAIAQoAhwiAEECdEGQN2oiASgCACAERgRAIAEgAjYCACACDQFB5DRB5DQoAgBBfiAAd3E2AgAMAgsCQCAEIAYoAhBGBEAgBiACNgIQDAELIAYgAjYCFAsgAkUNAQsgAiAGNgIYIAQoAhAiAARAIAIgADYCECAAIAI2AhgLIAQoAhQiAEUNACACIAA2AhQgACACNgIYCyAHIAlqIQcgBCAJaiIEKAIEIQALIAQgAEF+cTYCBCADIAdBAXI2AgQgAyAHaiAHNgIAIAdB/wFNBEAgB0F4cUGINWohAAJ/QeA0KAIAIgFBASAHQQN2dCICcUUEQEHgNCABIAJyNgIAIAAMAQsgACgCCAshASAAIAM2AgggASADNgIMIAMgADYCDCADIAE2AggMAQtBHyECIAdB////B00EQCAHQSYgB0EIdmciAGt2QQFxIABBAXRrQT5qIQILIAMgAjYCHCADQgA3AhAgAkECdEGQN2ohAAJAAkBB5DQoAgAiAUEBIAJ0IgVxRQRAQeQ0IAEgBXI2AgAgACADNgIADAELIAdBGSACQQF2a0EAIAJBH0cbdCECIAAoAgAhAQNAIAEiACgCBEF4cSAHRg0CIAJBHXYhASACQQF0IQIgACABQQRxaiIFKAIQIgENAAsgBSADNgIQCyADIAA2AhggAyADNgIMIAMgAzYCCAwBCyAAKAIIIgEgAzYCDCAAIAM2AgggA0EANgIYIAMgADYCDCADIAE2AggLIAhBCGohAAwCCwJAIAhFDQACQCAFKAIcIgFBAnRBkDdqIgIoAgAgBUYEQCACIAA2AgAgAA0BQeQ0IAdBfiABd3EiBzYCAAwCCwJAIAUgCCgCEEYEQCAIIAA2AhAMAQsgCCAANgIUCyAARQ0BCyAAIAg2AhggBSgCECIBBEAgACABNgIQIAEgADYCGAsgBSgCFCIBRQ0AIAAgATYCFCABIAA2AhgLAkAgA0EPTQRAIAUgAyAGaiIAQQNyNgIEIAAgBWoiACAAKAIEQQFyNgIEDAELIAUgBkEDcjYCBCAFIAZqIgQgA0EBcjYCBCADIARqIAM2AgAgA0H/AU0EQCADQXhxQYg1aiEAAn9B4DQoAgAiAUEBIANBA3Z0IgJxRQRAQeA0IAEgAnI2AgAgAAwBCyAAKAIICyEBIAAgBDYCCCABIAQ2AgwgBCAANgIMIAQgATYCCAwBC0EfIQAgA0H///8HTQRAIANBJiADQQh2ZyIAa3ZBAXEgAEEBdGtBPmohAAsgBCAANgIcIARCADcCECAAQQJ0QZA3aiEBAkACQCAHQQEgAHQiAnFFBEBB5DQgAiAHcjYCACABIAQ2AgAgBCABNgIYDAELIANBGSAAQQF2a0EAIABBH0cbdCEAIAEoAgAhAQNAIAEiAigCBEF4cSADRg0CIABBHXYhASAAQQF0IQAgAiABQQRxaiIHKAIQIgENAAsgByAENgIQIAQgAjYCGAsgBCAENgIMIAQgBDYCCAwBCyACKAIIIgAgBDYCDCACIAQ2AgggBEEANgIYIAQgAjYCDCAEIAA2AggLIAVBCGohAAwBCwJAIAlFDQACQCACKAIcIgFBAnRBkDdqIgUoAgAgAkYEQCAFIAA2AgAgAA0BQeQ0IAtBfiABd3E2AgAMAgsCQCACIAkoAhBGBEAgCSAANgIQDAELIAkgADYCFAsgAEUNAQsgACAJNgIYIAIoAhAiAQRAIAAgATYCECABIAA2AhgLIAIoAhQiAUUNACAAIAE2AhQgASAANgIYCwJAIANBD00EQCACIAMgBmoiAEEDcjYCBCAAIAJqIgAgACgCBEEBcjYCBAwBCyACIAZBA3I2AgQgAiAGaiIFIANBAXI2AgQgAyAFaiADNgIAIAgEQCAIQXhxQYg1aiEAQfQ0KAIAIQECf0EBIAhBA3Z0IgcgBHFFBEBB4DQgBCAHcjYCACAADAELIAAoAggLIQQgACABNgIIIAQgATYCDCABIAA2AgwgASAENgIIC0H0NCAFNgIAQeg0IAM2AgALIAJBCGohAAsgCkEQaiQAIAALGQBB0DQoAgAiAARAQdQ0IAA2AgAgABAECwsZAEHENCgCACIABEBByDQgADYCACAAEAQLCwQAQQALvhACF38CfSAAIQoCQEGsMigCACIIQYQyKAIAIg9rIgkgCCAIIAlLGyICRQ0AQZQyKAIAIA9BAnRqIQQgAkEETwRAIAJBfHEhCwNAIAQgAUECdGoiACAYIAAqAgAiGSAYIBleGyIYOAIAIAAgGCAAKgIEIhkgGCAZXhsiGDgCBCAAIBggACoCCCIZIBggGV4bIhg4AgggACAYIAAqAgwiGSAYIBleGyIYOAIMIAFBBGohASADQQRqIgMgC0cNAAsLIAJBA3EiAEUNAANAIAQgAUECdGoiAyAYIAMqAgAiGSAYIBleGyIYOAIAIAFBAWohASAFQQFqIgUgAEcNAAsLAkAgCCAJTQ0AQZQyKAIAIA8gCGtBAnRqIQUCQCAIIAJrQQNxIglFBEAgAiEBDAELQQAhACACIQEDQCAFIAFBAnRqIgQgGCAEKgIAIhkgGCAZXhsiGDgCACABQQFqIQEgAEEBaiIAIAlHDQALCyACIAhrQXxLDQAgBUEMaiECIAVBCGohCSAFQQRqIQQDQCAFIAFBAnQiAGoiAyAYIAMqAgAiGSAYIBleGyIYOAIAIAAgBGoiAyAYIAMqAgAiGSAYIBleGyIYOAIAIAAgCWoiAyAYIAMqAgAiGSAYIBleGyIYOAIAIAAgAmoiACAYIAAqAgAiGSAYIBleGyIYOAIAIAFBBGoiASAIRw0ACwtBtDMoAgBBAEoEQCAIIAggCiAIIApIGyIFayIAIAogACAKSBsiCUH+////B3EhFCAJQQFxIRUgBUH8////B3EhFiAFQQNxIRIgCUEBayETIAVBAWshF0GoMygCACEBQQAhCwNAAkBBrDMoAgAgAWtBAnUiACAFSQRAQagzIAUgAGsQBkGEMigCACEPQawyKAIAIQhBqDMoAgAhAQwBCyAAIAVNDQBBrDMgASAFQQJ0ajYCAAtBiDIoAgAiDCAIIAtsIhFBAnRqIQMCQCAIIA8gCHAiBmsiDSAFIAUgDUsbIgJFDQBBlDIoAgAhB0EAIQAgAkEBRwRAIAJBfnEhDkEAIQQDQCABIABBAnRqIAMgACAGakECdCIQaioCACAHIBBqKgIAlTgCACABIABBAXIiEEECdGogAyAGIBBqQQJ0IhBqKgIAIAcgEGoqAgCVOAIAIABBAmohACAEQQJqIgQgDkcNAAsLIAJBAXFFDQAgASAAQQJ0aiADIAAgBmpBAnQiAGoqAgAgACAHaioCAJU4AgALAkAgBSANTQ0AIAYgCGshBEGUMigCACEGIAUgAiIAa0EBcQRAIAEgAEECdGogAyAAIARqQQJ0IgdqKgIAIAYgB2oqAgCVOAIAIABBAWohAAsgAiAXRg0AIARBAWohAgNAIAEgAEECdGoiByADIAAgBGpBAnQiDWoqAgAgBiANaioCAJU4AgAgByADIAAgAmpBAnQiB2oqAgAgBiAHaioCAJU4AgQgAEECaiIAIAVJDQALC0HQNCgCACALQQJ0aiENAkAgBUEATA0AIA0oAgAhAkEAIQNBACEAQQAhBCAFQQNLBEADQCACIABBAnQiBmogASAGaioCADgCACACIAZBBHIiB2ogASAHaioCADgCACACIAZBCHIiB2ogASAHaioCADgCACACIAZBDHIiBmogASAGaioCADgCACAAQQRqIQAgBEEEaiIEIBZHDQALCyASRQ0AA0AgAiAAQQJ0IgRqIAEgBGoqAgA4AgAgAEEBaiEAIANBAWoiAyASRw0ACwsCQEGsMygCACABa0ECdSIAIAlJBEBBqDMgCSAAaxAGQawyKAIAIgggC2whEUGEMigCACEPQYgyKAIAIQxBqDMoAgAhAQwBCyAAIAlNDQBBrDMgASAJQQJ0ajYCAAsgDCARQQJ0aiEDAkAgCCAFIA9qIAhwIgZrIgwgCSAJIAxLGyICRQ0AQZQyKAIAIQdBACEAIAJBAUcEQCACQX5xIRFBACEEA0AgASAAQQJ0aiADIAAgBmpBAnQiDmoqAgAgByAOaioCAJU4AgAgASAAQQFyIg5BAnRqIAMgBiAOakECdCIOaioCACAHIA5qKgIAlTgCACAAQQJqIQAgBEECaiIEIBFHDQALCyACQQFxRQ0AIAEgAEECdGogAyAAIAZqQQJ0IgBqKgIAIAAgB2oqAgCVOAIACwJAIAkgDE0NACAGIAhrIQRBlDIoAgAhBiAJIAIiAGtBAXEEQCABIABBAnRqIAMgACAEakECdCIHaioCACAGIAdqKgIAlTgCACAAQQFqIQALIAIgE0YNACAEQQFqIQIDQCABIABBAnRqIgcgAyAAIARqQQJ0IgxqKgIAIAYgDGoqAgCVOAIAIAcgAyAAIAJqQQJ0IgdqKgIAIAYgB2oqAgCVOAIEIABBAmoiACAJSQ0ACwsCQCAJQQBMDQAgDSgCACAKQQJ0aiEEQQAhAEEAIQIgEwRAA0AgBCAAQX9zQQJ0aiIDIAMqAgAgASAAQQJ0aiIDKgIAkzgCACAEIABB/v///wNzQQJ0aiIGIAYqAgAgAyoCBJM4AgAgAEECaiEAIAJBAmoiAiAURw0ACwsgFUUNACAEIABBf3NBAnRqIgIgAioCACABIABBAnRqKgIAkzgCAAsgC0EBaiILQbQzKAIASA0ACwtDzczMPRAWAkBBtDMoAgAiBUEATA0AQQAhAkG4MygCACIAQQBMDQADQEEAIQEgAEEASgRAQcgzKAIAIAAgAmxBHGxqIQoDQCAKIAFBHGxqIgBCADcCCCAAQgA3AhAgAUEBaiIBQbgzKAIAIgBIDQALQbQzKAIAIQULIAJBAWoiAiAFSA0ACwsLGQBBuDQoAgAiAARAQbw0IAA2AgAgABAECwvNkgEEHn8TfQF+AXwjAEEQayIWJAAgFkEANgIMIBZBxDQ2AgggFkH4LzYCACAWIBZBDGo2AgQCQAJAAkACQEG0MygCACIKQQBMDQAgAEEATA0AQcQ0KAIAIQcgAEH8////B3EhBiAAQQNxIQsgAEEESSEFA0AgByAEQQJ0aigCACEIQQAhA0EAIQIgBUUEQANAIAggA0ECdGoiDCoCDCIgICCUIAwqAggiICAglCAMKgIEIiAgIJQgDCoCACIgICCUICSSkpKSISQgA0EEaiEDIAJBBGoiAiAGRw0ACwtBACECIAsEQANAIAggA0ECdGoqAgAiICAglCAkkiEkIANBAWohAyACQQFqIgIgC0cNAAsLIARBAWoiBCAKRw0ACyAkQ30dkCZgDQELQZAwKAIAIgNBrDIoAgBBAXRPBEACQEGUMC0AAEEBRw0AQYAwQgA3AwBB/C9BfzYCAEGUMEEAOgAAQYgwQgA3AwBByDMoAgAiA0HMMygCACICRg0AA0AgA0IANwIIIANCADcCECADQQA2AhggA0IANwIAIANBHGoiAyACRw0ACwsCQCAAQQBMBEBBtDMoAgAiB0EATA0BIAFBAEwNAUHQNCgCACECIAFBAnQhCkEAIQRBACEDIAdBBE8EQCAHQfz///8HcSEBQQAhBQNAIAIgA0ECdGoiBigCACAKEAUaIAYoAgQgChAFGiAGKAIIIAoQBRogBigCDCAKEAUaIANBBGohAyAFQQRqIgUgAUcNAAsLIAdBA3EiAUUNAQNAIAIgA0ECdGooAgAgChAFGiADQQFqIQMgBEEBaiIEIAFHDQALDAELIAFBAEwNAEG0MygCACINQQBMDQBB0DQoAgAhDkHENCgCACEMIA1B/v///wdxIQggDUEBcSEKQQAhBEEAIQUDQEEAIQNBACECIA1BAUcEQANAIAVBAnQiBiAOIANBAnQiC2ooAgBqIARBAnQiByALIAxqKAIAaioCADgCACAGIA4gC0EEciIGaigCAGogBiAMaigCACAHaioCADgCACADQQJqIQMgAkECaiICIAhHDQALCyAKBEAgDiADQQJ0IgNqKAIAIAVBAnRqIAMgDGooAgAgBEECdGoqAgA4AgALIARBAWoiA0EAIAAgA0cbIQQgBUEBaiIFIAFHDQALCyAWIAAQGAwDC0GQMCAAIANqNgIADAELQZQwQQE6AABBkDBBADYCAAsgAUEASgRAQwAAgD8gAbOVITAgALIhMQNAQQAhGEH8LygCAEG4MigCAE8EQEGEMEEANgIAQfwvQgA3AgACfyAZsyAxlCAwlBAdIiCLQwAAAE9dBEAgIKgMAQtBgICAgHgLIQVBvDMoAgAhBEG8MyAFNgIAIBYgBRAYQfwyQfQxKAIANgIAQYAzQfgxKAIAIgJB/DEoAgAiAyADIAJrQQJ1EA9B+C8tAABBAUYEQEGMM0GEMigCADYCAEGQM0GIMigCACICQYwyKAIAIgMgAyACa0ECdRAPQZwzQZQyKAIAIgJBmDIoAgAiAyADIAJrQQJ1EA9BuDIoAgAQFwtBiDBBwDMtAAAiByAFIARrIgZBAEpyIgM6AABBijBBsDAoAgBBAEdBmDAqAgBDAACAP1xyIgU6AAAgA0EBcSIEBEBBgDACfwJAIAdBAXFFBEBBiTAgBkG4MigCAGsiAyADQR91IgNzIANrQQFLIgM6AAAgAw0BQaAyKAIAQQFqIQJBgDAoAgAMAgtBiTBBAToAAAtBoDIoAgBBAWoiAkGAMCgCAGoLIAJqNgIAC0GLMEG8MCoCAEMAAIA/WwR/QbgwLQAAIAVxBUEBC0EBcSICOgAAAn0gB0EBcQRAQcQzKgIADAELQbgyKAIAsyAGsiIgQwAAgD8gIEMAAIA/XhuVCyEgQcAzQQA6AABBjDAgIDgCAEGUNEG0MygCACIDQQpBCSAEG2ogA0EAIAQbIgNBBGogAyAFG2oiA0EDaiADIAIbIgM2AgBBgDBBpDIoAgAgA0GAMCgCAGpqQQFqIhg2AgALQfgvLQAAIgJBAUYEQAJ/QYAwKAIAIgSzQ3e+fz+SQfwvKAIAQQFqs5RBuDIoAgCzlSIgQwAAgE9dICBDAAAAAGBxBEAgIKkMAQtBAAshAyAEIAMgAyAESxshGAsCQAJAIBhBhDAoAgAiA0sEQANAQYQwIANBAWo2AgACQEGIMC0AAEEBRgRAQaAyKAIAIQJBiTAtAABBAUYEQCACIANLBEBB/DIpAgAhM0H8MkH0MSkCADcCAEH0MSAzNwIAQYQzKQIAITNBhDNB/DEpAgA3AgBB/DEgMzcCACADQbgyKAIAECNB/DIpAgAhM0H8MkH0MSkCADcCAEH0MSAzNwIAQYQzKQIAITNBhDNB/DEpAgA3AgBB/DEgMzcCAAwDCyACIANGBEBBtDMoAgAiA0EATA0DQbgzKAIAIQJBACEFA0AgAkEASgRAQcgzKAIAIAIgBWxBHGxqIQZB3DIoAgBBtDIoAgAgBWxBA3RqIQRBACEDA0AgBiADQRxsaiAEIANBA3RqKQIANwIIIANBAWoiA0G4MygCACICSA0AC0G0MygCACEDCyAFQQFqIgUgA0gNAAsMAwsgAyACQX9zaiEDCyACIANLBEBB/DIpAgAhM0H8MkH0MSkCADcCAEH0MSAzNwIAQYQzKQIAITNBhDNB/DEpAgA3AgBB/DEgMzcCACADQQAQI0H8MikCACEzQfwyQfQxKQIANwIAQfQxIDM3AgBBhDMpAgAhM0GEM0H8MSkCADcCAEH8MSAzNwIADAILIAIgA0YEQEG0MygCACIDQQBMDQJBuDMoAgAhAkEAIQUDQCACQQBKBEBByDMoAgAgAiAFbEEcbGohBkHcMigCAEG0MigCACAFbEEDdGohBEEAIQMDQCAGIANBHGxqIAQgA0EDdGopAgA3AgAgA0EBaiIDQbgzKAIAIgJIDQALQbQzKAIAIQMLIAVBAWoiBSADSA0ACwwCCyADIAJBf3NqIQMLQZQ0KAIAIgIgA0sEQEEAIQVBACEEQQAhCUGMMCoCACElQYgwLQAAIgZBAUchAgJ/QbAyKAIAsyIjQbgyKAIAsyIilSIhEB0iIItDAAAAT10EQCAgqAwBC0GAgICAeAshFAJAIAJFBEBBtDMoAgAiAiADSwRAQbgzKAIAIQRByDMoAgAgIkPbD8lAlCIiQwAAwD8gI5VDAAAAPyAjlSIhk5QiIBAJISUgIBAKISMgBEEATA0CIAMgBGxBHGxqIQNBACECICIgIZQiIBAKISYgIBAJIScDQCADIAJBHGxqIgQgBCoCFCIhICaUIAQqAhAiICAnlJI4AhQgBCAgICaUICEgJ5STOAIQIAQgBCoCCCIhICaUIAQqAgwiICAnlJM4AgggBCAgICaUICEgJ5SSOAIMICYgJZQgJiAjlCAnICWUkyEmICcgI5SSIScgAkEBaiICQbgzKAIASA0ACwwCCyADIAJrIQMLAkACQEGKMC0AAEEBRgRAIANBAk0EQCADRQRAQeAzKAIAIg5B5DMoAgAiA0cEQCAOIAMgDmtBBGtBfHFBBGoQBRoLAkACQEG0MygCACIIQQBMBEBBuDMoAgAhBQwBC0G4MygCACIFQQBMDQFByDMoAgAhCiAFQf7///8HcSEHIAVBAXEhBgNAIAogBCAFbEEcbGohDEEAIQNBACEJIAVBAUcEQANAIAwgA0EcbGoiAiACKgIEIiAgIJQgAioCACIgICCUkiIgOAIYIA4gA0ECdGoiAiACKgIAICCSOAIAIAwgA0EBciICQRxsaiILIAsqAgQiICAglCALKgIAIiAgIJSSIiA4AhggDiACQQJ0aiICIAIqAgAgIJI4AgAgA0ECaiEDIAlBAmoiCSAHRw0ACwsgBgRAIAwgA0EcbGoiAiACKgIEIiAgIJQgAioCACIgICCUkiIgOAIYIA4gA0ECdGoiAyADKgIAICCSOAIACyAEQQFqIgQgCEcNAAsLIAVBAEwNAEHsMygCACEKQQAhCUEAIQMgBUEETwRAIAVB/P///wdxIQRBACEGA0AgCiADQQJ0IgdqIAcgDmoqAgA4AgAgCiAHQQRyIgJqIAIgDmoqAgA4AgAgCiAHQQhyIgJqIAIgDmoqAgA4AgAgCiAHQQxyIgJqIAIgDmoqAgA4AgAgA0EEaiEDIAZBBGoiBiAERw0ACwsgBUEDcSIERQ0AA0AgCiADQQJ0IgJqIAIgDmoqAgA4AgAgA0EBaiEDIAlBAWoiCSAERw0ACwtBmDRBADYCAAwHC0GYNCoCACEiAkBBuDMoAgAiAkEATA0AQwAAgD8gIUMAAAA/lEMAAIA/kpUhIUHsMygCACEIAkAgAkEDcSIGRQRAIAIhAwwBCyACIQMDQCAIIANBAWsiA0ECdGoiBSAFKgIAICKTICGUICKSIiI4AgAgBEEBaiIEIAZHDQALCyACQQRJIgpFBEAgCEEIayEHIAhBBGshBgNAIAYgA0ECdCIFaiIEIAQqAgAgIpMgIZQgIpIiIDgCACAFIAdqIgQgBCoCACAgkyAhlCAgkiIgOAIAIAggA0EDayIFQQJ0aiIEIAQqAgAgIJMgIZQgIJIiIDgCACAIIANBBGsiA0ECdGoiBCAEKgIAICCTICGUICCSIiI4AgAgBUEBSw0ACwsgAkEDcSEGQewzKAIAIQVBACEEAkAgCgRAQQAhAwwBCyACQfz///8HcSECQQAhAwNAIAUgA0ECdGoiByAHKgIAICKTICGUICKSIiA4AgAgByAHKgIEICCTICGUICCSIiA4AgQgByAHKgIIICCTICGUICCSIiA4AgggByAHKgIMICCTICGUICCSIiI4AgwgA0EEaiEDIAlBBGoiCSACRw0ACwsgBkUNAANAIAUgA0ECdGoiAiACKgIAICKTICGUICKSIiI4AgAgA0EBaiEDIARBAWoiBCAGRw0ACwtBmDQgIjgCAAwGCyADQQNGBEAjAEEQayIIJABB2DMoAgAiA0HUMygCACICRwRAQdgzIAI2AgAgAiEDCwJAAkACQEG4MygCACICQQBKBEADQEHgMygCACIHIAVBAnQiBGoqAgAgBEHsMygCACIGaioCAF9FBEBDAADAfyEhQwAAAAAhIkMAAAAAISQgAiAFSgRAAkADQCAHIAVBAnQiBGoqAgAiICAEIAZqKgIAXw0BICAgIpIhIiAgIAWylCAkkiEkIAVBAWoiBSACRw0ACyACIQULICQgIpUhIQsgIUMAAAA/kkGwMigCALMiIpUhJQJAQbAwKAIAIgIEQCAIICU4AgwgAiAIQQxqIAIoAgAoAhgRDgAhJEHYMygCACEDQbAyKAIAsyEiDAELQZgwKgIAISMgJUGcMCoCACIgX0UEQCAjQwAAgL+SICCUICWSISQMAQsgIyAllCEkCyAkICKUQwAAAL+SISBB2DMCf0HcMygCACIEIANLBEAgAyAgOAIEIAMgITgCACADQQhqDAELIANB1DMoAgAiAmtBA3UiB0EBaiIKQYCAgIACTw0EQf////8BIAQgAmsiBkECdSIEIAogBCAKSxsgBkH4////B08bIgoEfyAKQYCAgIACTw0GIApBA3QQBwVBAAsiBiAHQQN0aiIEICA4AgQgBCAhOAIAIARBCGohByACIANHBEADQCAEQQhrIgQgA0EIayIDKQIANwIAIAIgA0cNAAtB1DMoAgAhAgtB3DMgBiAKQQN0ajYCAEHYMyAHNgIAQdQzIAQ2AgAgAgRAIAIQBAsgBwsiAzYCAEG4MygCACECCyAFQQFqIgUgAkgNAAsLIAhBEGokAAwCCxANAAsQDgALDAYLIANBBGsiAkUNASADQQVrIQQMAgsgAwRAIANBAWshBCADIQIMAgsCQEG0MygCACIKQQBMBEBBuDMoAgAhAgwBC0G4MygCACICQQBMDQNByDMoAgAhByACQf7///8HcSEGIAJBAXEhBQNAIAcgAiAEbEEcbGohC0EAIQNBACEJIAJBAUcEQANAIAsgA0EcbGoiCCAIKgIEIiAgIJQgCCoCACIgICCUkjgCGCALIANBAXJBHGxqIgggCCoCBCIgICCUIAgqAgAiICAglJI4AhggA0ECaiEDIAlBAmoiCSAGRw0ACwsgBQRAIAsgA0EcbGoiAyADKgIEIiAgIJQgAyoCACIgICCUkjgCGAsgBEEBaiIEIApHDQALCyACQQBMDQJB+DMoAgAhCkEAIQlBACEDIAJBBE8EQCACQfz///8HcSEHQQAhBQNAIAogA0EDdGoiBEGAgID8AzYCBCAEIAOzOAIAIAogA0EBciIGQQN0aiIEQYCAgPwDNgIEIAQgBrM4AgAgCiADQQJyIgZBA3RqIgRBgICA/AM2AgQgBCAGszgCACAKIANBA3IiBkEDdGoiBEGAgID8AzYCBCAEIAazOAIAIANBBGohAyAFQQRqIgUgB0cNAAsLIAJBA3EiBEUNAgNAIAogA0EDdGoiAkGAgID8AzYCBCACIAOzOAIAIANBAWohAyAJQQFqIgkgBEcNAAsMAgtBACEDAkBB1DMoAgAiC0HYMygCACIIRgRAQbgzKAIAIgdBAEwNAUH4MygCACEKIAdBBE8EQCAHQfz///8HcSEGA0AgCiADQQN0aiICQYCAgPwDNgIEIAIgA7M4AgAgCiADQQFyIgVBA3RqIgJBgICA/AM2AgQgAiAFszgCACAKIANBAnIiBUEDdGoiAkGAgID8AzYCBCACIAWzOAIAIAogA0EDciIFQQN0aiICQYCAgPwDNgIEIAIgBbM4AgAgA0EEaiEDIAlBBGoiCSAGRw0ACwsgB0EDcSIFRQ0BA0AgCiADQQN0aiICQYCAgPwDNgIEIAIgA7M4AgAgA0EBaiEDIARBAWoiBCAFRw0ACwwBCyALKgIAISJBuDMoAgAiDAJ/IAsqAgQiIY0iIItDAAAAT10EQCAgqAwBC0GAgICAeAsiAiACIAxKG0EASgRAICIgIZMhIUH4MygCACEEA0AgBCADQQN0aiICQYCAgPwDNgIEIAIgISADs5I4AgAgA0EBaiIDIAwCfyALKgIEjSIgi0MAAABPXQRAICCoDAELQYCAgIB4CyICIAIgDEobSA0ACwsgCCALa0EDdSIHQQJPBEBB+DMoAgAhBkEBIQQDQCAMAn8gCyAEQQN0aiICKgIEIiGNIiCLQwAAAE9dBEAgIKgMAQtBgICAgHgLIgMgAyAMShshCiAKAn8gAkEEayIFKgIAIiKNIiCLQwAAAE9dBEAgIKgMAQtBgICAgHgLIgNBACADQQBKGyIDSgRAIAJBCGsqAgAiICAikyElQwAAgD8gISAik5UiIyAiICEgIJKTIAIqAgCSIiKUQwAAwECUISEDQCAGIANBA3RqIgIgISADsyIgIAUqAgCTICOUIiiUQwAAgD8gKJOUQwAAgD+SOAIEIAIgJSAgkiAoICiUICKUQwAAQEAgKCAokpOUkjgCACADQQFqIgMgCkcNAAsLIARBAWoiBCAHRw0ACwsgCEEIayoCAEEAIQQCfyAIQQRrKgIAIiGLQwAAAE9dBEAgIagMAQtBgICAgHgLIgNBACADQQBKGyICIAxODQAgIZMhIEH4MygCACEHIAwgAiIDa0EDcSIGBEADQCAHIANBA3RqIgVBgICA/AM2AgQgBSAgIAOzkjgCACADQQFqIQMgBEEBaiIEIAZHDQALCyACIAxrQXxLDQADQCAHIANBA3RqIgJBgICA/AM2AgQgAiAgIAOzkjgCACAHIANBAWoiBEEDdGoiAkGAgID8AzYCBCACICAgBLOSOAIAIAcgA0ECaiIEQQN0aiICQYCAgPwDNgIEIAIgICAEs5I4AgAgByADQQNqIgRBA3RqIgJBgICA/AM2AgQgAiAgIASzkjgCACADQQRqIgMgDEcNAAsLDAMLQYswLQAAQQFGBEAgAkEDTQRAQwAAAAAhJCMAQRBrIgwkAAJAAkACQAJAIAQOAgIBAAtBuDMoAgAiA0EATA0CQbAyKAIAIQoDQCAJs0MAAAA/kiAKsyIilSEkAkBBuDAtAABBAUcNAEGwMCgCACICBEAgDCAkOAIMIAIgDEEMaiACKAIAKAIYEQ4AISRBuDMoAgAhA0GwMigCACIKsyEiDAELQZgwKgIAISEgJEGcMCoCACIgX0UEQCAhQwAAgL+SICCUICSSISQMAQsgISAklCEkC0MAAAAAISFBqDQoAgAiAiAJQQJ0aioCACElQwAAgD9BvDAqAgCTQZwwKgIAIiOUICSSQcAwKgIAICSUIiAgICAjXhsgIpRDAAAAv5IiIkMAAAAAXUUEQCADsiIgICIgICAiXRsiICAgjiIgkyACAn8gIItDAAAAT10EQCAgqAwBC0GAgICAeAtBAnRqIgIqAgQgAioCACIgk5QgIJIhIQsCQEG0MygCACIIQQBMDQAgISAlQ2BCog2SlSIgICCUISBByDMoAgAgCUEcbGpBGGohC0EAIQVBACECIAhBBE8EQCAIQfz///8HcSEHQQAhBANAIAsgAiADbEEcbGoiBiAgIAYqAgCUOAIAIAsgAyACQQFybEEcbGoiBiAgIAYqAgCUOAIAIAsgAyACQQJybEEcbGoiBiAgIAYqAgCUOAIAIAsgAyACQQNybEEcbGoiBiAgIAYqAgCUOAIAIAJBBGohAiAEQQRqIgQgB0cNAAsLIAhBA3EiBkUNAANAIAsgAiADbEEcbGoiBCAgIAQqAgCUOAIAIAJBAWohAiAFQQFqIgUgBkcNAAsLIAlBAWoiCSADSA0ACwwCC0G4MygCACICQQBMDQFEAAAAAAAA8D9BpDQqAgC7RAAAAAAAAOA/okQAAAAAAADwP6CjtiEhQag0KAIAIQgCQCACQQNxIgZFBEAgAiEDDAELIAIhAwNAIAggA0EBayIDQQJ0aiIEIAQqAgAgJJMgIZQgJJIiJDgCACAFQQFqIgUgBkcNAAsLIAJBBEkiCkUEQCAIQQhrIQcgCEEEayEGA0AgBiADQQJ0IgVqIgQgBCoCACAkkyAhlCAkkiIgOAIAIAUgB2oiBCAEKgIAICCTICGUICCSIiA4AgAgCCADQQNrIgVBAnRqIgQgBCoCACAgkyAhlCAgkiIgOAIAIAggA0EEayIDQQJ0aiIEIAQqAgAgIJMgIZQgIJIiJDgCACAFQQFLDQALCyACQQNxIQdBACEFAkAgCgRAQQAhAwwBCyACQfz///8HcSEGQQAhA0EAIQQDQCAIIANBAnRqIgogCioCACAkkyAhlCAkkiIgOAIAIAogCioCBCAgkyAhlCAgkiIgOAIEIAogCioCCCAgkyAhlCAgkiIgOAIIIAogCioCDCAgkyAhlCAgkiIkOAIMIANBBGohAyAEQQRqIgQgBkcNAAsLIAcEQANAIAggA0ECdGoiBCAEKgIAICSTICGUICSSIiQ4AgAgA0EBaiEDIAVBAWoiBSAHRw0ACwsgAiEDA0AgCCADQQFrIgRBAnRqIgUgBSoCACAkkyAhlCAkkiIkOAIAIANBAUogBCEDDQALIAJBA3EhBkEAIQUCQCACQQRJBEBBACEDDAELIAJB/P///wdxIQJBACEDQQAhBANAIAggA0ECdGoiByAHKgIAICSTICGUICSSIiA4AgAgByAHKgIEICCTICGUICCSIiA4AgQgByAHKgIIICCTICGUICCSIiA4AgggByAHKgIMICCTICGUICCSIiQ4AgwgA0EEaiEDIARBBGoiBCACRw0ACwsgBkUNAQNAIAggA0ECdGoiAiACKgIAICSTICGUICSSIiQ4AgAgA0EBaiEDIAVBAWoiBSAGRw0ACwwBC0GoNCgCACIRQaw0KAIAIgNHBEAgESADIBFrQQRrQXxxQQRqEAUaCwJAQbQzKAIAIghBAEwNAEG4MygCACIOQQBMDQBByDMoAgAhCiAOQfz///8HcSEHIA5BA3EhCyAOQQRJIQYDQCAKIAkgDmxBHGxqIQ1BACECQQAhBSAGRQRAA0AgESACQQJ0aiIDIAMqAgAgDSACQRxsaioCGJI4AgAgESACQQFyIgRBAnRqIgMgAyoCACANIARBHGxqKgIYkjgCACARIAJBAnIiBEECdGoiAyADKgIAIA0gBEEcbGoqAhiSOAIAIBEgAkEDciIEQQJ0aiIDIAMqAgAgDSAEQRxsaioCGJI4AgAgAkEEaiECIAVBBGoiBSAHRw0ACwtBACEFIAsEQANAIBEgAkECdGoiAyADKgIAIA0gAkEcbGoqAhiSOAIAIAJBAWohAiAFQQFqIgUgC0cNAAsLIAlBAWoiCSAIRw0ACwtBpDRBtDQqAgAiIEGwMigCALOUQwAAAL+SOAIAICBDAAAAAF5FBEBBACECQQAhBUEAIQRBqDQoAgAhC0G4MygCACIDQQNOBEAgA0ECayEIIAtBBGohCiALQQRrIQdBASEGA0ACQCALIAYiA0ECdCIGaioCACIgIAYgB2oqAgBdDQAgICAGIApqKgIAXw0AICAgCyAEQQJ0aioCAF8NACALIAJBAnRqKgIAICBgBEAgAyEEDAELIAsgBUECdGoqAgAgIF0EQCACIQQgBSECIAMhBQwBCyACIQQgAyECCyADQQFqIQYgAyAIRw0ACwsCQCALIAJBAnRqKgIAuyALIAVBAnRqKgIAIiK7IjREmpmZmZmZuT+iZEUNAAJAIAUgAmsiAyADQR91IgNzIANrIgMgBUEIbUwNACADIAVBB2xBCG1ODQAgBSADbyEFCyALIARBAnRqKgIAuyA0RHsUrkfheoQ/omUNACAFIARrIgMgA0EfdSIDcyADayIDIAVBCG1MDQAgAyAFQQdsQQhtTg0AIAUgA28hBQtBoDQgIkGgNCoCACIgk7tEAAAAAAAA0D+iICC7oLYiITgCAEGcNCAiIAWylEGcNCoCACIgk7tEAAAAAAAA0D+iICC7oLYiIDgCAEGkNCAgICFDYEKiDZKVOAIAC0G4MygCACIHQQBMDQBBqDQoAgAhBkEAIQVBACECIAdBBE8EQCAHQfz///8HcSEDQQAhBANAIAYgAkECdGoiCiAKKgIAkTgCACAKIAoqAgSROAIEIAogCioCCJE4AgggCiAKKgIMkTgCDCACQQRqIQIgBEEEaiIEIANHDQALCyAHQQNxIgRFDQADQCAGIAJBAnRqIgMgAyoCAJE4AgAgAkEBaiECIAVBAWoiBSAERw0ACwsgDEEQaiQADAQLIAJBBGshBAtBtDMoAgAiBSAESwRAQbgzKAIAIgJBAEwNAUGENCgCACACIARsIgNBDGxqIQdByDMoAgAgA0EcbGohBkEAIQUDQAJ/QfgzKAIAIAVBA3RqIgMqAgAiII4iIYtDAAAAT10EQCAhqAwBC0GAgICAeAshCyAgICGTISMgByAFQQxsaiIIKgIAISsgAyoCBCEgIAgCfQJAIAtBAEgiCkUEQEMAAAAAIScgAiALTA0BQcgzKAIAIAtBHGxqIAIgBGxBHGxqKgIYIScMAQtDAAAAACEnQwAAAAAgC0F/Rw0BGgtDAAAAACALQQFqIgMgAk4NABpByDMoAgAgA0EcbGogAiAEbEEcbGoqAhgLICeTICOUICeSICBDAAAAACAgQwAAAABeG5QiKjgCAAJ9AkAgCkUEQEMAAAAAISdDAAAAACEpIAIgC0wNAUHIMygCACALQRxsaiACIARsQRxsaiIDKgIEIScgAyoCACEpDAELQwAAAAAhJ0MAAAAAISlDAAAAACEkQwAAAAAhJkMAAAAAIAtBf0cNARoLQwAAAAAhJCACIAtBAWoiA0wEQEMAAAAAISYgKQwBC0HIMygCACADQRxsaiACIARsQRxsaiIDKgIEISYgAyoCACEkICkLISAgCCAmICeTICOUICeSIig4AgggCCAkICCTICOUICCSIiI4AgQgBiAFQRxsaiIIAn0CQAJAAn0CfSAKRQRAQwAAAABBuDMoAgAiAiALTA0BGkHIMygCACALQRxsaiACIARsQRxsaiIDKgIMIScgAyoCCAwCCyALQX9HBEBDAAAAACEnQwAAAAAhJAwDC0G4MygCACECQwAAAAALISdDAAAAAAshJCALQQFqIgMgAkgNAQtDAAAAACElQwAAAAAMAQtByDMoAgAgA0EcbGogAiAEbEEcbGoiAyoCDCElIAMqAggLICSTICOUICSSIiEgKJQgJSAnkyAjlCAnkiIgICKUkyIlIAgqAhAiI5QgICAolCAhICKUkiIiIAgqAhQiIZSSICogKyAqICteG0N9HZAmkiIglTgCFCAIICIgI5QgJSAhlJMgIJU4AhAgBUEBaiIFQbgzKAIAIgJIDQALDAELIAQgBWsiAkEHTQRAQbgzKAIAIgMgAmxBA3YiCSADIAJBAWpsQQN2IhFPDQFDAAAAPyAlICVDAAAAP10bIiBDAACAQEMAAAAAICBDAAAAQF4bICCTIi2TQwAAADCUIS4gFLIhLANAIAlBDGwhD0GENCgCACETQbgzKAIAIRVBACECAkAgBUECSA0AIAVBAWsiAkEDcSEQIA8gE2oiEioCACEmQQEhA0EAIQQCQCAFQQJrQQNJBEBBACECDAELIAJBfHEhDUEAIQJBACEFA0AgEiAVIANBA2oiDmxBDGxqKgIAIiUgEiAVIANBAmoiDGxBDGxqKgIAIiMgEiAVIANBAWoiC2xBDGxqKgIAIiIgEiADIBVsQQxsaioCACIhICYgISAmXiIIGyIhICEgIl0iChsiISAhICNdIgcbIiEgISAlXSIGGyEmIA4gDCALIAMgAiAIGyAKGyAHGyAGGyECIANBBGohAyAFQQRqIgUgDUcNAAsLIBBFDQADQCASIAMgFWxBDGxqKgIAIiEgJiAhICZeIgUbISYgAyACIAUbIQIgA0EBaiEDIARBAWoiBCAQRw0ACwsgEyACIBVsIgNBDGxqIgUgD2ohCEHIMygCACIMIANBHGwiC2ohCkH4MygCACEGAn0CfSAJRQRAQwAAAAAhJ0MAAAAADAELAn0CQAJ/IAYgCUEDdGoqAgAiKiAgIiJDAAAAQF9FBEBBkDRB/////wdBAEGQNCgCACIDIANByNsCbiIDQcjbAmxrQY/5AmwiBCADQccabCIDSRsgBCADa2oiAzYCACAuIANBAWuzlCAtkiEiCyAikyIjjiIhi0MAAABPXQRAICGoDAELQYCAgIB4CyIEQQBOBEBDAAAAACEmQwAAAAAhKSAEIBVODQEgDCAEQRxsaiALaiIDKgIEISYgAyoCACEpDAELQwAAAAAhJkMAAAAAISlDAAAAACElQwAAAAAhIUMAAAAAIARBf0cNARoLQwAAAAAhJSAVIARBAWoiA0wEQEMAAAAAISEgKQwBCyAMIANBHGxqIAtqIgMqAgQhISADKgIAISUgKQshKCAlICiTICMgBLKTIiWUICiSIiMgCCoCCCIklCAhICaTICWUICaSIiEgCCoCBCIrlJMiKCAKIAlBHGxqIgNBDGsqAgAiJZQgISAklCAjICuUkiIjIANBCGsqAgAiIZSSIScgIyAllCAoICGUkyIoIAkgFEgNABoCQAJAAn8gKiAiICyUkyIjjiIhi0MAAABPXQRAICGoDAELQYCAgIB4CyIEQQBOBEBDAAAAACEiQwAAAAAhJiAEIBVODQEgDCAEQRxsaiALaiIDKgIEISIgAyoCACEmDAELQwAAAAAhIkMAAAAAISZDAAAAACEpQwAAAAAhJSAEQX9HDQELQwAAAAAhKSAVIARBAWoiA0wEQEMAAAAAISUMAQsgDCADQRxsaiALaiIDKgIEISUgAyoCACEpCyAlICKTICMgBLKTIiGUICKSIiIgJJQgKSAmkyAhlCAmkiIhICuUkiIlIAogCSAUa0EcbGoiAyoCFCIjlCAnkiAhICSUICIgK5STIiIgAyoCECIhlJIhJyAlICGUICiSICMgIpSTCyIkIAkgFUEBa04NABogICIhQwAAAEBfRQRAQZA0Qf////8HQQBBkDQoAgAiAyADQcjbAm4iA0HI2wJsa0GP+QJsIgQgA0HHGmwiA0kbIAQgA2tqIgM2AgAgLiADQQFrs5QgLZIhIQsCQAJAAn8gBiAJQQFqIgRBA3RqKgIAICGTIiOOIiKLQwAAAE9dBEAgIqgMAQtBgICAgHgLIgdBAE4EQEMAAAAAISJDAAAAACElIAcgFU4NASAMIAdBHGxqIAtqIgMqAgQhIiADKgIAISUMAQtDAAAAACEiQwAAAAAhJUMAAAAAISZDAAAAACEpIAdBf0cNAQtDAAAAACEmIBUgB0EBaiIDTARAQwAAAAAhKQwBCyAMIANBHGxqIAtqIgMqAgQhKSADKgIAISYLICkgIpMgIyAHspMiI5QgIpIiKyAFIARBDGxqIgMqAggiKpQgJiAlkyAjlCAlkiIjIAMqAgQiIpSSIiggCiAEQRxsaiIDKgIUIiWUICMgKpQgKyAilJMiIyADKgIQIiKUkyAnkiEnICggIpQgJJIgIyAllJIiJCAJIBUgFGtODQAaAn0CQAJ/IAYgCSAUaiIEQQN0aioCACAhICyUkyIjjiIhi0MAAABPXQRAICGoDAELQYCAgIB4CyIGQQBOBEBDAAAAACEiQwAAAAAhKSAGIBVODQEgDCAGQRxsaiALaiIDKgIEISIgAyoCACEpDAELQwAAAAAhIkMAAAAAISlDAAAAACEhQwAAAAAhJkMAAAAAIAZBf0cNARoLQwAAAAAhISAVIAZBAWoiA0wEQEMAAAAAISYgKQwBCyAMIANBHGxqIAtqIgMqAgQhJiADKgIAISEgKQshJSAmICKTICMgBrKTIiOUICKSIisgBSAEQQxsaiIDKgIIIiqUICEgJZMgI5QgJZIiKCADKgIEIiGUkiIlIAogBEEcbGoiAyoCFCIjlCAnkiADKgIQIiIgKCAqlCArICGUkyIhlJMhJyAlICKUICSSICEgI5SSCyEmIAogCUEcbCIGaiIHIAgqAgAgJyAnlCAmICaUkiIhQ30dkCZeBH0gIQUgCCkCBCIzp74iJiAmlEN9HZAmkiAzQiCIp74iJyAnlJILlZEiISAnlDgCFCAHICEgJpQ4AhBBtDMoAgAiBUEASgRAQQAhAwNAIAIgA0cEQEHIMygCAEG4MygCACADbCIFQRxsaiAIKgIEIipBhDQoAgAgBUEMbGogD2oiBSoCCCIolCAIKgIIIiIgBSoCBCIhlJMiJSAHKgIQIiOUICIgKJQgKiAhlJIiIiAHKgIUIiGUkiImICaUICIgI5QgJSAhlJMiJyAnlJIiIkN9HZAmXkUEQCAFKQIEIjOnviInICeUQ30dkCaSIDNCIIinviImICaUkiEiCyAGaiIEIAUqAgAgIpWRIiEgJpQ4AhQgBCAhICeUOAIQQbQzKAIAIQULIANBAWoiAyAFSA0ACwsgCUEBaiIJIBFHDQALDAELIAJBCEcNACAGRQ0AQcgzKAIAIgNBzDMoAgAiAkYNAANAIAMgAykCADcCCCADQRxqIgMgAkcNAAsLDAELIAIgA0YEQEG0MygCACIEQQBMDQFBACEFQbgzKAIAIgJBAEwNAQNAQQAhAyACQQBKBEBByDMoAgAgAiAFbEEcbGohBkHcMigCAEG0MigCACAFbEEDdGohBANAIAQgA0EDdGogBiADQRxsaikCEDcCACADQQFqIgNBuDMoAgAiAkgNAAtBtDMoAgAhBAsgBUEBaiIFIARIDQALDAELIAMgAkF/c2oiG0GkMigCAE8NAAJ/IBsEQEHcMigCAEG0MigCACAbbEEDdGoMAQtB9DJBADYCAEGUMigCACEIAkBB2DIoAgBB1DIoAgBrIhBBACAQQQBKGyICQawyKAIAIg1BhDIoAgAiCmsiAyACIANKGyIHIA0gEGoiAyANIAMgDUgbIhEgByARSBsiAyACTA0AIAJBAWohBCAIIApBAnRqIQ5ByDIoAgAhDEG8MigCACELQbAyKAIAsyEgIAMgAmtBAXEEQCAOIAJBAnQiBmoiBSALIAIgEGtBAnRqKgIAICCUIAYgDGoqAgCUIAUqAgCSOAIAIAQhAgsgAyAERg0AA0AgDiACQQJ0IgVqIgQgCyACIBBrQQJ0aioCACAglCAFIAxqKgIAlCAEKgIAkjgCACAOIAJBAWoiBkECdCIFaiIEIAsgBiAQa0ECdGoqAgAgIJQgBSAMaioCAJQgBCoCAJI4AgAgAkECaiICIANHDQALCwJAIAcgEU4NACADQQFqIQIgCCAKIA1rQQJ0aiEKQcgyKAIAIQdBvDIoAgAhBkGwMigCALMhICARIANrQQFxBEAgCiADQQJ0IgVqIgQgBiADIBBrQQJ0aioCACAglCAFIAdqKgIAlCAEKgIAkjgCACACIQMLIAIgEUYNAANAIAogA0ECdCIEaiICIAYgAyAQa0ECdGoqAgAgIJQgBCAHaioCAJQgAioCAJI4AgAgCiADQQFqIgVBAnQiBGoiAiAGIAUgEGtBAnRqKgIAICCUIAQgB2oqAgCUIAIqAgCSOAIAIANBAmoiAyARRw0ACwtB3DIoAgALIR1B7DEoAgBB6DEoAgBrQXBHBEBB6DIoAgAhHkEAIQMDQCMAQRBrIgokAEHEMCgCACIHQZwxKAIAQZgxKAIAbCINQQJ0IgJqIQYCQCADRQRAIA1BAXYhDkHcMCgCACEMQQAhAgNAIAcgAkECdCILaiAdIA0gAkF/c2oiCEEDdGoiBSoCBCIkIB0gAkEDdCIEaikCACIzQiCIp74iK5IiKiAEIAxqIgQqAgQiKJQgM6e+IiUgBSoCACIikyIhIAQqAgAiIJSSIiMgIiAlkiIikjgCACAGIAtqICogIJQgISAolJMiISArICSTIiCSOAIAIAcgCEECdCIEaiAiICOTOAIAIAQgBmogISAgkzgCACACIA5GIAJBAWohAkUNAAsMAQtB0DAoAgAiBSACaiEEIANBAWsiCEHsMSgCAEHoMSgCACICa0EDdU8EQCANRQ0BQegwKAIAIQtBACECA0AgHiACQQN0IgZqIgggBiALaiIHKgIAIiMgBCACQQJ0IgZqKgIAIiKUIAcqAgQiISAFIAZqKgIAIiCUkzgCBCAIICEgIpQgIyAglJI4AgAgAkEBaiICIA1HDQALDAELIAogAiAIQQN0aikCACIzNwMAIAogMzcDCEEAIQxBoDEoAgAiEkGkMSgCACASa0EBdWohDwJAAkACQAJAAkACQAJAAkACQAJAAkACQAJAAkACQCAKKAIADg4AAQIDBAUGBwgJCgsMDQ4LQZAxKAIAQYwxKAIAIghrQQN1IgJBAU0EQCAFIAcqAgA4AgAgBCAGKgIAOAIADA4LQYAxIAJBASAHIAYgBSAEIAggCCACQQJ0ahAUDA0LQZgxKAIAIg5FDQwgDkEBcQJAIA5BAWsiC0UEQEEAIQkMAQsgDkF+cSEIQQAhCUEAIQ0DQCASIAlBAnRqIgQgByAJQQN0aiICKgIAOAIAIAQgDkECdCIFaiACKgIEOAIAIBIgCUEBciICQQJ0aiIEIAcgAkEDdGoiAioCADgCACAEIAVqIAIqAgQ4AgAgCUECaiEJIA1BAmoiDSAIRw0ACwsEQCASIAlBAnRqIgQgByAJQQN0aiICKgIAOAIAIAQgDkECdGogAioCBDgCAAsgDkEBcQJAIAtFBEBBACEJDAELIA5BfnEhB0EAIQlBACENA0AgDyAJQQJ0aiIEIAYgCUEDdGoiAioCADgCACAEIA5BAnQiBWogAioCBDgCACAPIAlBAXIiAkECdGoiBCAGIAJBA3RqIgIqAgA4AgAgBCAFaiACKgIEOAIAIAlBAmohCSANQQJqIg0gB0cNAAsLRQ0MIA8gCUECdGoiBCAGIAlBA3RqIgIqAgA4AgAgBCAOQQJ0aiACKgIEOAIADAwLQZgxKAIAIg1FDQsgDUEBcSANQQN0IQ4CQCANQQFrIghFBEBBACEJDAELIA1BfnEhBUEAIQlBACEUA0AgEiAJQQJ0aiIMIAcgCUEMbGoiAioCADgCACAMIA1BAnQiBGogAioCBDgCACAMIA5qIAIqAgg4AgAgEiAJQQFyIgJBAnRqIgwgByACQQxsaiICKgIAOAIAIAQgDGogAioCBDgCACAMIA5qIAIqAgg4AgAgCUECaiEJIBRBAmoiFCAFRw0ACwsEQCASIAlBAnRqIgQgByAJQQxsaiICKgIAOAIAIAQgDUECdGogAioCBDgCACAEIA5qIAIqAgg4AgALIA1BAXECQCAIRQRAQQAhCQwBCyANQX5xIQVBACEJQQAhFANAIA8gCUECdGoiCCAGIAlBDGxqIgIqAgA4AgAgCCANQQJ0IgRqIAIqAgQ4AgAgCCAOaiACKgIIOAIAIA8gCUEBciICQQJ0aiIIIAYgAkEMbGoiAioCADgCACAEIAhqIAIqAgQ4AgAgCCAOaiACKgIIOAIAIAlBAmohCSAUQQJqIhQgBUcNAAsLRQ0LIA8gCUECdGoiBCAGIAlBDGxqIgIqAgA4AgAgBCANQQJ0aiACKgIEOAIAIAQgDmogAioCCDgCAAwLC0GYMSgCACILRQ0KIAtBDGwhBCALQQN0IQJBACEUQQAhDQNAIBIgDUECdGoiCCAHIA1BBHRqIgUqAgA4AgAgCCALQQJ0aiAFKgIEOAIAIAIgCGogBSoCCDgCACAEIAhqIAUqAgw4AgAgDUEBaiINIAtHDQALA0AgDyAUQQJ0aiIHIAYgFEEEdGoiBSoCADgCACAHIAtBAnRqIAUqAgQ4AgAgAiAHaiAFKgIIOAIAIAQgB2ogBSoCDDgCACAUQQFqIhQgC0cNAAsMCgtBmDEoAgAiDEUNCSAMQQR0IQUgDEEMbCEEIAxBA3QhAkEAIQlBACENA0AgEiANQQJ0aiILIAcgDUEUbGoiCCoCADgCACALIAxBAnRqIAgqAgQ4AgAgAiALaiAIKgIIOAIAIAQgC2ogCCoCDDgCACAFIAtqIAgqAhA4AgAgDUEBaiINIAxHDQALA0AgDyAJQQJ0aiIIIAYgCUEUbGoiByoCADgCACAIIAxBAnRqIAcqAgQ4AgAgAiAIaiAHKgIIOAIAIAQgCGogByoCDDgCACAFIAhqIAcqAhA4AgAgCUEBaiIJIAxHDQALDAkLQZwxKAIAIhNFDQhBmDEoAgAiEEUNCCATQX5xIQggE0EBcSEFQQAhFANAIA8gFEECdCICaiERIAIgEmohDSAGIBMgFGxBAnQiAmohDiACIAdqIQxBACEJQQAhCyATQQFHBEADQCANIAkgEGxBAnQiBGogDCAJQQJ0IgJqKgIAOAIAIAQgEWogAiAOaioCADgCACANIAlBAXIiAiAQbEECdCIEaiAMIAJBAnQiAmoqAgA4AgAgBCARaiACIA5qKgIAOAIAIAlBAmohCSALQQJqIgsgCEcNAAsLIAUEQCANIAkgEGxBAnQiBGogDCAJQQJ0IgJqKgIAOAIAIAQgEWogAiAOaioCADgCAAsgFEEBaiIUIBBHDQALDAgLQZAxKAIAQYwxKAIAIgZrQQN1IgJBAU0EQCAFIBIqAgA4AgAgBCAPKgIAOAIADAgLQYAxIAJBASASIA8gBSAEIAYgBiACQQJ0ahAUDAcLIA8gCigCBEECdCICaiEIIAIgEmohByACIARqIQYgAiAFaiEFQZAxKAIAQYwxKAIAIgRrQQN1IgJBAU0EQCAFIAcqAgA4AgAgBiAIKgIAOAIADAcLQYAxIAJBASAHIAggBSAGIAQgBCACQQJ0ahAUDAYLQZgxKAIAIgJBnDEoAgBBAWtsIgtFDQUgBCACQQJ0IgJqIQggAiAFaiEHQcQxKAIAIQZBuDEoAgAhBUEAIRQDQCAHIBRBAnQiDGoiBCAIIAxqIgIqAgAiIyAGIAxqKgIAIiKUIAQqAgAiISAFIAxqKgIAIiCUkjgCACACICMgIJQgIiAhlJM4AgAgFEEBaiIUIAtHDQALDAULQZgxKAIAIg5FDQQgBCAOQQJ0IgJqIQwgAiAFaiELQQAhCQNAIAwgCUECdCICaiIIKgIAISMgAiAEaiIHKgIAISIgAiAFaiIGIAIgC2oiAioCACIhIAYqAgAiIJI4AgAgByAjICKSOAIAIAIgICAhkzgCACAIICIgI5M4AgAgCUEBaiIJIA5HDQALDAQLQZgxKAIAIhBFDQMgBCAQQQN0IgJqIREgAiAFaiENIAQgEEECdCICaiEOIAIgBWohDEEAIQkDQCARIAlBAnQiE2oiCyoCACEsIA4gE2oiCCoCACEkIAQgE2oiByoCACEjIAUgE2oiAiAMIBNqIgYqAgAiIiACKgIAIiCSIA0gE2oiAioCACIhkjgCACAHICwgJCAjkpI4AgAgBiAgICJDAAAAv5SSIisgJEPXs10/lCIqkyAhQwAAAL+UIiiSICxD17NdP5QiJZI4AgAgCCAjICRDAAAAv5SSIiMgIkPXs10/lCIikiAhQ9ezXT+UIiGTICxDAAAAv5QiIJI4AgAgAiArICqSICiSICWTOAIAIAsgIyAikyAhkiAgkjgCACAJQQFqIgkgEEcNAAsMAwtBmDEoAgAiFUUNAiAEIBVBDGwiAmohFCACIAVqIRIgBCAVQQN0IgJqIQ8gAiAFaiETIAQgFUECdCICaiEQIAIgBWohEUEAIQkDQCAUIAlBAnQiAmoiDSoCACEpIAIgEGoiDioCACEiIAIgD2oiDCoCACEtIAIgBGoiCyoCACEuIAIgBWoiCCACIBJqIgcqAgAiLCACIBFqIgYqAgAiJJIiKyACIBNqIgIqAgAiISAIKgIAIiCSIiqSOAIAIAsgKSAikiIoIC0gLpIiJZI4AgAgBiAgICGTIiMgIiApkyIikzgCACAOICQgLJMiISAuIC2TIiCSOAIAIAIgKiArkzgCACAMICUgKJM4AgAgByAiICOSOAIAIA0gICAhkzgCACAJQQFqIgkgFUcNAAsMAgtBACEcQZgxKAIAIhoEQCAEIBpBBHQiAmohHyACIAVqIQkgBCAaQQxsIgJqIRUgAiAFaiEUIAQgGkEDdCICaiESIAIgBWohDyAEIBpBAnQiAmohEyACIAVqIRADQCAEIBxBAnQiF2oiESoCACEvIBUgF2oiDSoCACEqIBIgF2oiDioCACEoIBcgH2oiDCoCACEiIBMgF2oiCyoCACEhIAUgF2oiAiAUIBdqIggqAgAiLCAPIBdqIgcqAgAiJZIiJiACKgIAIieSIAkgF2oiBioCACIjIBAgF2oiAioCACIgkiIpkjgCACARIC8gKiAokiItkiAiICGSIi6SOAIAIAIgJyApQ3o3nj6UICZDvRtPP5STkiIkICIgIZMiIkNxeHM/lCAqICiTIiFDGHkWP5SSIiuSOAIAIAsgLyAuQ3o3nj6UIC1DvRtPP5STkiIqICAgI5MiKENxeHM/lCAlICyTIiBDGHkWP5SSIiWSOAIAIAcgJyAmQ3o3nj6UIClDvRtPP5STkiIjICJDGHkWP5QgIUNxeHM/lJMiIpI4AgAgDiAvIC1DejeePpQgLkO9G08/lJOSIiEgKEMYeRY/lCAgQ3F4cz+UkyIgkjgCACAIICMgIpM4AgAgDSAhICCTOAIAIAYgJCArkzgCACAMICogJZM4AgAgHEEBaiIcIBpHDQALCwwBC0EAIQlBACESAkBBmDEoAgAiD0UNAEHcMSgCACITQZwxKAIAIhFBAnRqIRAgEUECTwRAIBFBfnEhCyARQQFxIQgDQCAEIAxBAnQiAmohDSACIAVqIQ5DAAAAACEoQQAhCUMAAAAAISVBACESA0AgEyAJQQJ0IgZqIA4gCSAPbEECdCICaioCACIjOAIAIAYgEGogAiANaioCACIiOAIAIBMgCUEBciICQQJ0IgZqIA4gAiAPbEECdCICaioCACIhOAIAIAYgEGogAiANaioCACIgOAIAICEgIyAlkpIhJSAgICIgKJKSISggCUECaiEJIBJBAmoiEiALRw0ACyAOIAgEfSATIAlBAnQiBmogDiAJIA9sQQJ0IgJqKgIAIiE4AgAgBiAQaiACIA1qKgIAIiA4AgAgICAokiEoICEgJZIFICULOAIAIA0gKDgCAEHQMSgCACEHQQEhEgNAIBAqAgAhKCATKgIAISVBASEJA0AgKCAHIAkgEmwgEXBBA3RqIgYqAgQiIyATIAlBAnQiAmoqAgAiIpSTIAIgEGoqAgAiISAGKgIAIiCUkiEoICIgIJQgJZIgISAjlJIhJSAJQQFqIgkgEUcNAAsgDiAPIBJsQQJ0IgJqICU4AgAgAiANaiAoOAIAIBJBAWoiEiARRw0ACyAMQQFqIgwgD0cNAAsMAQsgEQRAIA9BAUcEQCAPQX5xIQcDQCATIAUgCUECdCIIaiIGKgIAIiE4AgAgECAEIAhqIgIqAgAiIDgCACAGICE4AgAgAiAgOAIAIBMgBSAIQQRyIgJqIgYqAgAiITgCACAQIAIgBGoiAioCACIgOAIAIAYgITgCACACICA4AgAgCUECaiEJIBJBAmoiEiAHRw0ACwsgD0EBcUUNASATIAUgCUECdCICaiIFKgIAIiE4AgAgECACIARqIgIqAgAiIDgCACAFICE4AgAgAiAgOAIADAELIA9BBE8EQCAPQXxxIQZBACEHA0AgBSAJQQJ0IghqQQA2AgAgBCAIakEANgIAIAUgCEEEciICakEANgIAIAIgBGpBADYCACAFIAhBCHIiAmpBADYCACACIARqQQA2AgAgBSAIQQxyIgJqQQA2AgAgAiAEakEANgIAIAlBBGohCSAHQQRqIgcgBkcNAAsLIA9BA3EiBkUNAANAIAUgCUECdCICakEANgIAIAIgBGpBADYCACAJQQFqIQkgEkEBaiISIAZHDQALCwsLIApBEGokACADQQFqIgNB7DEoAgBB6DEoAgBrQQN1QQJqSQ0ACwtB2DIoAgAiBUGsMigCACIPQYQyKAIAIhNrIhEgBSARSyIDGyILIA9JIQdBiDIoAgAgDyAbbEECdGohEAJAIBEgBSADGyIERQ0AIBAgE0ECdGohDUHoMigCAEGwMigCACAFa0ECdGohDkHIMigCACEMQQAhAiAEQQFHBEAgBEF+cSEGQQAhCANAIA0gAkECdCIKaiIDIAMqAgAgCiAOaioCACAKIAxqKgIAlJM4AgAgDSAKQQRyIgpqIgMgAyoCACAKIA5qKgIAIAogDGoqAgCUkzgCACACQQJqIQIgCEECaiIIIAZHDQALCyAEQQFxRQ0AIA0gAkECdCICaiIDIAMqAgAgAiAOaioCACACIAxqKgIAlJM4AgALIAsgDyAHGyEDAkAgBSARTQ0AIARBAWohAiAQIBMgD2tBAnRqIQhB6DIoAgBBsDIoAgAgBWtBAnRqIQpByDIoAgAhByAFIARrQQFxBEAgCCAEQQJ0IgZqIgQgBCoCACAGIApqKgIAIAYgB2oqAgCUkzgCACACIQQLIAIgBUYNAANAIAggBEECdCIGaiICIAIqAgAgBiAKaioCACAGIAdqKgIAlJM4AgAgCCAGQQRqIgZqIgIgAioCACAGIApqKgIAIAYgB2oqAgCUkzgCACAEQQJqIgQgBUcNAAsLAkAgAyAFTQ0AIAVBAWohBCAQIBNBAnRqIQxB6DIoAgAhCEHIMigCACEKIAMgBSICa0EBcQRAIAwgAkECdCIGaiICIAIqAgAgCCoCACAGIApqKgIAlJI4AgAgBCECCyADIARGDQADQCAMIAJBAnQiBmoiBCAEKgIAIAggAiAFa0ECdGoqAgAgBiAKaioCAJSSOAIAIAwgAkEBaiIHQQJ0IgZqIgQgBCoCACAIIAcgBWtBAnRqKgIAIAYgCmoqAgCUkjgCACACQQJqIgIgA0cNAAsLAkAgCyAPTw0AIANBAWohAiAQIBMgD2tBAnRqIQhB6DIoAgAhCkHIMigCACEHIA8gA2tBAXEEQCAIIANBAnQiBmoiBCAEKgIAIAogAyAFa0ECdGoqAgAgBiAHaioCAJSSOAIAIAIhAwsgAiAPRg0AA0AgCCADQQJ0IgRqIgIgAioCACAKIAMgBWtBAnRqKgIAIAQgB2oqAgCUkjgCACAIIANBAWoiBkECdCIEaiICIAIqAgAgCiAGIAVrQQJ0aioCACAEIAdqKgIAlJI4AgAgA0ECaiIDIA9HDQALCwtBhDAoAgAiAyAYSQ0AC0H8L0H8LygCAEEBajYCAEH4Ly0AAEEBcQ0BDAILQfwvQfwvKAIAQQFqNgIAIAJFDQELQYwzKQIAITNBjDNBhDIpAgA3AgBBhDIgMzcCAEGUMykCACEzQZQzQYwyKQIANwIAQYwyIDM3AgBBnDMpAgAhM0GcM0GUMikCADcCAEGUMiAzNwIAQaQzKAIAIQNBpDNBnDIoAgA2AgBBnDIgAzYCAAsCQEG0MygCACILQQBMDQBBhDIoAgBBrDIoAgAiCHBBAnQiA0GUMigCAGohCkGIMigCACADaiEHQdA0KAIAIQZBACEDIAtBAUcEQCALQf7///8HcSEFQQAhGANAIBlBAnQiBCAGIANBAnRqKAIAaiAHIAMgCGxBAnRqKgIAIAoqAgCVOAIAIAQgBiADQQFyIgJBAnRqKAIAaiAHIAIgCGxBAnRqKgIAIAoqAgCVOAIAIANBAmohAyAYQQJqIhggBUcNAAsLIAtBAXFFDQAgBiADQQJ0aigCACAZQQJ0aiAHIAMgCGxBAnRqKgIAIAoqAgCVOAIAC0EBEBdB+C8tAAAEQEGMMykCACEzQYwzQYQyKQIANwIAQYQyIDM3AgBBlDMpAgAhM0GUM0GMMikCADcCAEGMMiAzNwIAQZwzKQIAITNBnDNBlDIpAgA3AgBBlDIgMzcCAEGkMygCACEDQaQzQZwyKAIANgIAQZwyIAM2AgALIBlBAWoiGSABRw0ACwsgFiAAEBhBvDNBvDMoAgAgAGs2AgALIBZBEGokAAvLDwMbfwV9AXwgACEJQawzKAIAIgBBqDMoAgAiA0cEQEGsMyADNgIAIAMhAAsCQEG4MigCAEGsMigCAGoiByAAIANrQQJ1IgRLBEBBqDMgByAEaxAGQagzKAIAIQNBrDMoAgAhAAwBCyAEIAdNDQBBrDMgAyAHQQJ0aiIANgIACyAAIANrQQJ1IQgCQAJAQbQzKAIAIg9BAEwEQEGoMigCACENQfQxKAIAIRQMAQtBqDIoAgAiDUH0MSgCACIUIA1wIg5rIgsgCCAIIAtLGyEHIA4gDWshFUH4MSgCACEQIAkgCSAIayIAQQAgAEEAShsiBEoEQCADIAggCWtBAnRqIQVBxDQoAgAhGSAHQXxxIRogB0EDcSERIAggB2tBA3EhEiAJIARrQQNxIRMgBCAJa0F8SyEbIAcgCGtBfEshHANAIBkgDEECdGooAgAhBiAEIQBBACECIBMEQANAIAUgAEECdCIKaiAGIApqKgIAIh44AgAgAEEBaiEAIB4gHpQgHZIhHSACQQFqIgIgE0cNAAsLIBtFBEADQCAFIABBAnQiAmogAiAGaioCACIeOAIAIAUgAkEEaiIKaiAGIApqKgIAIh84AgAgBSACQQhqIgpqIAYgCmoqAgAiIDgCACAFIAJBDGoiAmogAiAGaioCACIhOAIAICEgIZQgICAglCAfIB+UIB4gHpQgHZKSkpIhHSAAQQRqIgAgCUcNAAsLIBAgDCANbEECdGohCgJAIAdFDQAgCiAOQQJ0aiECQQAhF0EAIQBBACEYIAdBBE8EQANAIAIgAEECdCIGaiADIAZqKgIAOAIAIAIgBkEEciIWaiADIBZqKgIAOAIAIAIgBkEIciIWaiADIBZqKgIAOAIAIAIgBkEMciIGaiADIAZqKgIAOAIAIABBBGohACAYQQRqIhggGkcNAAsLIBFFDQADQCACIABBAnQiBmogAyAGaioCADgCACAAQQFqIQAgF0EBaiIXIBFHDQALCwJAIAggC00NACAKIBVBAnRqIQZBACECIAchACASBEADQCAGIABBAnQiCmogAyAKaioCADgCACAAQQFqIQAgAkEBaiICIBJHDQALCyAcDQADQCAGIABBAnQiAmogAiADaioCADgCACAGIAJBBGoiCmogAyAKaioCADgCACAGIAJBCGoiCmogAyAKaioCADgCACAGIAJBDGoiAmogAiADaioCADgCACAAQQRqIgAgCEkNAAsLIAxBAWoiDCAPRw0AC0H0MSAIIBRqIA1wNgIAQfgyQfgyKAIAIAhqNgIAIB1DfR2QJl0NAkGUMEEBOgAAQZAwQQA2AgAMAgsgB0UEQCAIIAtNDQEgECAVQQJ0aiEGIAhBfHEhDCAIQQNxIQVBACEJIAhBBEkhDgNAIAYgCSANbEECdGohB0EAIQBBACECIA5FBEADQCAHIABBAnQiBGogAyAEaioCADgCACAHIARBBHIiC2ogAyALaioCADgCACAHIARBCHIiC2ogAyALaioCADgCACAHIARBDHIiBGogAyAEaioCADgCACAAQQRqIQAgAkEEaiICIAxHDQALC0EAIQIgBQRAA0AgByAAQQJ0IgRqIAMgBGoqAgA4AgAgAEEBaiEAIAJBAWoiAiAFRw0ACwsgCUEBaiIJIA9HDQALDAELIAggC0sEQCAHQXxxIQsgB0EDcSEGIAggB2tBA3EhDEEAIQkgB0EESSERIAcgCGtBfEshEgNAIBAgCSANbEECdGoiEyAOQQJ0aiEEQQAhAEEAIQIgEUUEQANAIAQgAEECdCIFaiADIAVqKgIAOAIAIAQgBUEEciIKaiADIApqKgIAOAIAIAQgBUEIciIKaiADIApqKgIAOAIAIAQgBUEMciIFaiADIAVqKgIAOAIAIABBBGohACACQQRqIgIgC0cNAAsLQQAhAiAGBEADQCAEIABBAnQiBWogAyAFaioCADgCACAAQQFqIQAgAkEBaiICIAZHDQALCyATIBVBAnRqIQRBACECIAchACAMBEADQCAEIABBAnQiBWogAyAFaioCADgCACAAQQFqIQAgAkEBaiICIAxHDQALCyASRQRAA0AgBCAAQQJ0IgJqIAIgA2oqAgA4AgAgBCACQQRqIgVqIAMgBWoqAgA4AgAgBCACQQhqIgVqIAMgBWoqAgA4AgAgBCACQQxqIgJqIAIgA2oqAgA4AgAgAEEEaiIAIAhJDQALCyAJQQFqIgkgD0cNAAsMAQsgB0F8cSEMIAdBA3EhBiAQIA5BAnRqIQ5BACEJA0AgDiAJIA1sQQJ0aiEEQQAhAEEAIQIgB0EDSwRAA0AgBCAAQQJ0IgVqIAMgBWoqAgA4AgAgBCAFQQRyIgtqIAMgC2oqAgA4AgAgBCAFQQhyIgtqIAMgC2oqAgA4AgAgBCAFQQxyIgVqIAMgBWoqAgA4AgAgAEEEaiEAIAJBBGoiAiAMRw0ACwtBACECIAYEQANAIAQgAEECdCIFaiADIAVqKgIAOAIAIABBAWohACACQQFqIgIgBkcNAAsLIAlBAWoiCSAPRw0ACwtB9DEgCCAUaiANcDYCAEH4MkH4MigCACAIajYCAAtBwDNBAToAAEHEM0QAAAAAAADwPyABo0G4MigCALgiIiABICKiRAAAAAAAAPA/ZBu2OAIACwoAQbQ0IAA4AgALLABBuDAgAToAAEG8MCAAQ6uqqj2UuxAetiIAOAIAQcAwQwAAgD8gAJU4AgALIABBvDAgADgCAEG4MCABOgAAQcAwQwAAgD8gAJU4AgALcgIBfwF9QZgwIABDq6qqPZS7EB62IgM4AgBDAACAPyEAQZwwIAFDAAAAAF8EfUMAAIA/BSABIAORlQs4AgBBsDAoAgAhAkGwMEEANgIAAkAgAiACQaAwRgR/QRAFIAJFDQFBFAsgAigCAGooAgARAAALC2YCAX8BfUGYMCAAOAIAQwAAgD8hA0GcMCABQwAAAABfBH1DAACAPwUgASAAkZULOAIAQbAwKAIAIQJBsDBBADYCAAJAIAIgAkGgMEYEf0EQBSACRQ0BQRQLIAIoAgBqKAIAEQAACwsMACAAIAEgAiADEBkLkgYBAX9BqDQoAgAiAARAQaw0IAA2AgAgABAEC0GENCgCACIABEBBiDQgADYCACAAEAQLQfgzKAIAIgAEQEH8MyAANgIAIAAQBAtB7DMoAgAiAARAQfAzIAA2AgAgABAEC0HgMygCACIABEBB5DMgADYCACAAEAQLQdQzKAIAIgAEQEHYMyAANgIAIAAQBAtByDMoAgAiAARAQcwzIAA2AgAgABAEC0GoMygCACIABEBBrDMgADYCACAAEAQLQZwzKAIAIgAEQEGgMyAANgIAIAAQBAtBkDMoAgAiAARAQZQzIAA2AgAgABAEC0GAMygCACIABEBBhDMgADYCACAAEAQLQegyKAIAIgAEQEHsMiAANgIAIAAQBAtB3DIoAgAiAARAQeAyIAA2AgAgABAEC0HIMigCACIABEBBzDIgADYCACAAEAQLQbwyKAIAIgAEQEHAMiAANgIAIAAQBAtBlDIoAgAiAARAQZgyIAA2AgAgABAEC0GIMigCACIABEBBjDIgADYCACAAEAQLQfgxKAIAIgAEQEH8MSAANgIAIAAQBAtB6DEoAgAiAARAQewxIAA2AgAgABAEC0HcMSgCACIABEBB4DEgADYCACAAEAQLQdAxKAIAIgAEQEHUMSAANgIAIAAQBAtBxDEoAgAiAARAQcgxIAA2AgAgABAEC0G4MSgCACIABEBBvDEgADYCACAAEAQLQawxKAIAIgAEQEGwMSAANgIAIAAQBAtBoDEoAgAiAARAQaQxIAA2AgAgABAEC0GMMSgCACIABEBBkDEgADYCACAAEAQLQYAxKAIAIgAEQEGEMSAANgIAIAAQBAtB9DAoAgAiAARAQfgwIAA2AgAgABAEC0HoMCgCACIABEBB7DAgADYCACAAEAQLQdwwKAIAIgAEQEHgMCAANgIAIAAQBAtB0DAoAgAiAARAQdQwIAA2AgAgABAEC0HEMCgCACIABEBByDAgADYCACAAEAQLAkBBsDAoAgAiAEGgMEYEf0EQBSAARQ0BQRQLIQEgACAAKAIAIAFqKAIAEQAACwtnAgJ8AX8CfyABuyICRHsUrkfheqQ/oiIDmUQAAAAAAADgQWMEQCADqgwBC0GAgICAeAshBCAAAn8gAkSamZmZmZm5P6IiAplEAAAAAAAA4EFjBEAgAqoMAQtBgICAgHgLIARBARAZC2cCAnwBfwJ/IAG7IgJEuB6F61G4nj+iIgOZRAAAAAAAAOBBYwRAIAOqDAELQYCAgIB4CyEEIAACfyACRLgehetRuL4/oiICmUQAAAAAAADgQWMEQCACqgwBC0GAgICAeAsgBEEAEBkL8gEBA38jAEEgayICJABDzczMPRAWQfwyQfQxKAIANgIAQYAzQfgxKAIAIgBB/DEoAgAiASABIABrQQJ1EA9BjDNBhDIoAgA2AgBBkDNBiDIoAgAiAEGMMigCACIBIAEgAGtBAnUQD0GcM0GUMigCACIAQZgyKAIAIgEgASAAa0ECdRAPQbwzQX82AgBBzDMoAgBByDMoAgAgAkEANgIYIAJCADcDECACQgA3AwggAkIANwMAa0EcbSACECVBgDBCADcDAEH8L0F/NgIAQYgwQgA3AwBBnDRCADcCAEHAM0EAOgAAQZAwQQA2AgAgAkEgaiQACxYAQdgyKAIAQbgyKAIAQfgvLQAAbGoLDwBBrDIoAgBB1DIoAgBrCwgAQbgyKAIACwvxJwUAQYAIC1YvZGV2L3VyYW5kb20AYmFzaWNfc3RyaW5nAHJhbmRvbV9kZXZpY2UgZ2V0ZW50cm9weSBmYWlsZWQAcmFuZG9tIGRldmljZSBub3Qgc3VwcG9ydGVkIABB4AgL1xUDAAAABAAAAAQAAAAGAAAAg/miAERObgD8KRUA0VcnAN009QBi28AAPJmVAEGQQwBjUf4Au96rALdhxQA6biQA0k1CAEkG4AAJ6i4AHJLRAOsd/gApsRwA6D6nAPU1ggBEuy4AnOmEALQmcABBfl8A1pE5AFODOQCc9DkAi1+EACj5vQD4HzsA3v+XAA+YBQARL+8AClqLAG0fbQDPfjYACcsnAEZPtwCeZj8ALepfALondQDl68cAPXvxAPc5BwCSUooA+2vqAB+xXwAIXY0AMANWAHv8RgDwq2sAILzPADb0mgDjqR0AXmGRAAgb5gCFmWUAoBRfAI1AaACA2P8AJ3NNAAYGMQDKVhUAyahzAHviYABrjMAAGcRHAM1nwwAJ6NwAWYMqAIt2xACmHJYARK/dABlX0QClPgUABQf/ADN+PwDCMugAmE/eALt9MgAmPcMAHmvvAJ/4XgA1HzoAf/LKAPGHHQB8kCEAaiR8ANVu+gAwLXcAFTtDALUUxgDDGZ0ArcTCACxNQQAMAF0Ahn1GAONxLQCbxpoAM2IAALTSfAC0p5cAN1XVANc+9gCjEBgATXb8AGSdKgBw16sAY3z4AHqwVwAXFecAwElWADvW2QCnhDgAJCPLANaKdwBaVCMAAB+5APEKGwAZzt8AnzH/AGYeagCZV2EArPtHAH5/2AAiZbcAMuiJAOa/YADvxM0AbDYJAF0/1AAW3tcAWDveAN6bkgDSIigAKIboAOJYTQDGyjIACOMWAOB9ywAXwFAA8x2nABjgWwAuEzQAgxJiAINIAQD1jlsArbB/AB7p8gBISkMAEGfTAKrd2ACuX0IAamHOAAoopADTmbQABqbyAFx3fwCjwoMAYTyIAIpzeACvjFoAb9e9AC2mYwD0v8sAjYHvACbBZwBVykUAytk2ACio0gDCYY0AEsl3AAQmFAASRpsAxFnEAMjFRABNspEAABfzANRDrQApSeUA/dUQAAC+/AAelMwAcM7uABM+9QDs8YAAs+fDAMf4KACTBZQAwXE+AC4JswALRfMAiBKcAKsgewAutZ8AR5LCAHsyLwAMVW0AcqeQAGvnHwAxy5YAeRZKAEF54gD034kA6JSXAOLmhACZMZcAiO1rAF9fNgC7/Q4ASJq0AGekbABxckIAjV0yAJ8VuAC85QkAjTElAPd0OQAwBRwADQwBAEsIaAAs7lgAR6qQAHTnAgC91iQA932mAG5IcgCfFu8AjpSmALSR9gDRU1EAzwryACCYMwD1S34AsmNoAN0+XwBAXQMAhYl/AFVSKQA3ZMAAbdgQADJIMgBbTHUATnHUAEVUbgALCcEAKvVpABRm1QAnB50AXQRQALQ72wDqdsUAh/kXAElrfQAdJ7oAlmkpAMbMrACtFFQAkOJqAIjZiQAsclAABKS+AHcHlADzMHAAAPwnAOpxqABmwkkAZOA9AJfdgwCjP5cAQ5T9AA2GjAAxQd4AkjmdAN1wjAAXt+cACN87ABU3KwBcgKAAWoCTABARkgAP6NgAbICvANv/SwA4kA8AWRh2AGKlFQBhy7sAx4m5ABBAvQDS8gQASXUnAOu29gDbIrsAChSqAIkmLwBkg3YACTszAA6UGgBROqoAHaPCAK/trgBcJhIAbcJNAC16nADAVpcAAz+DAAnw9gArQIwAbTGZADm0BwAMIBUA2MNbAPWSxADGrUsATsqlAKc3zQDmqTYAq5KUAN1CaAAZY94AdozvAGiLUgD82zcArqGrAN8VMQAArqEADPvaAGRNZgDtBbcAKWUwAFdWvwBH/zoAavm5AHW+8wAok98Aq4AwAGaM9gAEyxUA+iIGANnkHQA9s6QAVxuPADbNCQBOQukAE76kADMjtQDwqhoAT2WoANLBpQALPw8AW3jNACP5dgB7iwQAiRdyAMamUwBvbuIA7+sAAJtKWADE2rcAqma6AHbPzwDRAh0AsfEtAIyZwQDDrXcAhkjaAPddoADGgPQArPAvAN3smgA/XLwA0N5tAJDHHwAq27YAoyU6AACvmgCtU5MAtlcEACkttABLgH4A2genAHaqDgB7WaEAFhIqANy3LQD65f0Aidv+AIm+/QDkdmwABqn8AD6AcACFbhUA/Yf/ACg+BwBhZzMAKhiGAE296gCz568Aj21uAJVnOQAxv1sAhNdIADDfFgDHLUMAJWE1AMlwzgAwy7gAv2z9AKQAogAFbOQAWt2gACFvRwBiEtIAuVyEAHBhSQBrVuAAmVIBAFBVNwAe1bcAM/HEABNuXwBdMOQAhS6pAB2ywwChMjYACLekAOqx1AAW9yEAj2nkACf/dwAMA4AAjUAtAE/NoAAgpZkAs6LTAC9dCgC0+UIAEdrLAH2+0ACb28EAqxe9AMqigQAIalwALlUXACcAVQB/FPAA4QeGABQLZACWQY0Ah77eANr9KgBrJbYAe4k0AAXz/gC5v54AaGpPAEoqqABPxFoALfi8ANdamAD0x5UADU2NACA6pgCkV18AFD+xAIA4lQDMIAEAcd2GAMnetgC/YPUATWURAAEHawCMsKwAssDQAFFVSAAe+w4AlXLDAKMGOwDAQDUABtx7AOBFzABOKfoA1srIAOjzQQB8ZN4Am2TYANm+MQCkl8MAd1jUAGnjxQDw2hMAujo8AEYYRgBVdV8A0r31AG6SxgCsLl0ADkTtABw+QgBhxIcAKf3pAOfW8wAifMoAb5E1AAjgxQD/140AbmriALD9xgCTCMEAfF10AGutsgDNbp0APnJ7AMYRagD3z6kAKXPfALXJugC3AFEA4rINAHS6JADlfWAAdNiKAA0VLACBGAwAfmaUAAEpFgCfenYA/f2+AFZF7wDZfjYA7NkTAIu6uQDEl/wAMagnAPFuwwCUxTYA2KhWALSotQDPzA4AEoktAG9XNAAsVokAmc7jANYguQBrXqoAPiqcABFfzAD9C0oA4fT7AI47bQDihiwA6dSEAPy0qQDv7tEALjXJAC85YQA4IUQAG9nIAIH8CgD7SmoALxzYAFO0hABOmYwAVCLMACpV3ADAxtYACxmWABpwuABplWQAJlpgAD9S7gB/EQ8A9LURAPzL9QA0vC0ANLzuAOhdzADdXmAAZ46bAJIz7wDJF7gAYVibAOFXvABRg8YA2D4QAN1xSAAtHN0ArxihACEsRgBZ89cA2XqYAJ5UwABPhvoAVgb8AOV5rgCJIjYAOK0iAGeT3ABV6KoAgiY4AMrnmwBRDaQAmTOxAKnXDgBpBUgAZbLwAH+IpwCITJcA+dE2ACGSswB7gkoAmM8hAECf3ADcR1UA4XQ6AGfrQgD+nd8AXtRfAHtnpAC6rHoAVfaiACuIIwBBulUAWW4IACEqhgA5R4MAiePmAOWe1ABJ+0AA/1bpABwPygDFWYoAlPorANPBxQAPxc8A21quAEfFhgCFQ2IAIYY7ACx5lAAQYYcAKkx7AIAsGgBDvxIAiCaQAHg8iQCoxOQA5dt7AMQ6wgAm9OoA92eKAA2SvwBloysAPZOxAL18CwCkUdwAJ91jAGnh3QCalBkAqCmVAGjOKAAJ7bQARJ8gAE6YygBwgmMAfnwjAA+5MgCn9Y4AFFbnACHxCAC1nSoAb35NAKUZUQC1+asAgt/WAJbdYQAWNgIAxDqfAIOioQBy7W0AOY16AIK4qQBrMlwARidbAAA07QDSAHcA/PRVAAFZTQDgcYAAQcMeC60BQPsh+T8AAAAALUR0PgAAAICYRvg8AAAAYFHMeDsAAACAgxvwOQAAAEAgJXo4AAAAgCKC4zYAAAAAHfNpNf6CK2VHFWdAAAAAAAAAOEMAAPr+Qi52vzo7nrya9wy9vf3/////3z88VFVVVVXFP5ErF89VVaU/F9CkZxERgT8AAAAAAADIQu85+v5CLuY/JMSC/72/zj+19AzXCGusP8xQRtKrsoM/hDpOm+DXVT8AQf4fC/IP8D9uv4gaTzubPDUz+6k99u8/XdzYnBNgcbxhgHc+muzvP9FmhxB6XpC8hX9u6BXj7z8T9mc1UtKMPHSFFdOw2e8/+o75I4DOi7ze9t0pa9DvP2HI5mFO92A8yJt1GEXH7z+Z0zNb5KOQPIPzxso+vu8/bXuDXaaalzwPiflsWLXvP/zv/ZIatY4890dyK5Ks7z/RnC9wPb4+PKLR0zLso+8/C26QiTQDarwb0/6vZpvvPw69LypSVpW8UVsS0AGT7z9V6k6M74BQvMwxbMC9iu8/FvTVuSPJkbzgLamumoLvP69VXOnj04A8UY6lyJh67z9Ik6XqFRuAvHtRfTy4cu8/PTLeVfAfj7zqjYw4+WrvP79TEz+MiYs8dctv61tj7z8m6xF2nNmWvNRcBITgW+8/YC86PvfsmjyquWgxh1TvP504hsuC54+8Hdn8IlBN7z+Nw6ZEQW+KPNaMYog7Ru8/fQTksAV6gDyW3H2RST/vP5SoqOP9jpY8OGJ1bno47z99SHTyGF6HPD+msk/OMe8/8ucfmCtHgDzdfOJlRSvvP14IcT97uJa8gWP14d8k7z8xqwlt4feCPOHeH/WdHu8/+r9vGpshPbyQ2drQfxjvP7QKDHKCN4s8CwPkpoUS7z+Py86JkhRuPFYvPqmvDO8/tquwTXVNgzwVtzEK/gbvP0x0rOIBQoY8MdhM/HAB7z9K+NNdOd2PPP8WZLII/O4/BFuOO4Cjhrzxn5JfxfbuP2hQS8ztSpK8y6k6N6fx7j+OLVEb+AeZvGbYBW2u7O4/0jaUPujRcbz3n+U02+fuPxUbzrMZGZm85agTwy3j7j9tTCqnSJ+FPCI0Ekym3u4/imkoemASk7wcgKwERdruP1uJF0iPp1i8Ki73IQrW7j8bmklnmyx8vJeoUNn10e4/EazCYO1jQzwtiWFgCM7uP+9kBjsJZpY8VwAd7UHK7j95A6Ha4cxuPNA8wbWixu4/MBIPP47/kzze09fwKsPuP7CvervOkHY8Jyo21dq/7j934FTrvR2TPA3d/ZmyvO4/jqNxADSUj7ynLJ12srnuP0mjk9zM3oe8QmbPotq27j9fOA+9xt54vIJPnVYrtO4/9lx77EYShrwPkl3KpLHuP47X/RgFNZM82ie1Nkev7j8Fm4ovt5h7PP3Hl9QSre4/CVQc4uFjkDwpVEjdB6vuP+rGGVCFxzQ8t0ZZiiap7j81wGQr5jKUPEghrRVvp+4/n3aZYUrkjLwJ3Ha54aXuP6hN7zvFM4y8hVU6sH6k7j+u6SuJeFOEvCDDzDRGo+4/WFhWeN3Ok7wlIlWCOKLuP2QZfoCqEFc8c6lM1FWh7j8oIl6/77OTvM07f2aeoO4/grk0h60Sary/2gt1EqDuP+6pbbjvZ2O8LxplPLKf7j9RiOBUPdyAvISUUfl9n+4/zz5afmQfeLx0X+zodZ/uP7B9i8BK7oa8dIGlSJqf7j+K5lUeMhmGvMlnQlbrn+4/09QJXsuckDw/Xd5PaaDuPx2lTbncMnu8hwHrcxSh7j9rwGdU/eyUPDLBMAHtoe4/VWzWq+HrZTxiTs8286LuP0LPsy/FoYi8Eho+VCek7j80NzvxtmmTvBPOTJmJpe4/Hv8ZOoRegLytxyNGGqfuP25XcthQ1JS87ZJEm9mo7j8Aig5bZ62QPJlmitnHqu4/tOrwwS+3jTzboCpC5azuP//nxZxgtmW8jES1FjKv7j9EX/NZg/Z7PDZ3FZmuse4/gz0epx8Jk7zG/5ELW7TuPykebIu4qV285cXNsDe37j9ZuZB8+SNsvA9SyMtEuu4/qvn0IkNDkrxQTt6fgr3uP0uOZtdsyoW8ugfKcPHA7j8nzpEr/K9xPJDwo4KRxO4/u3MK4TXSbTwjI+MZY8juP2MiYiIExYe8ZeVde2bM7j/VMeLjhhyLPDMtSuyb0O4/Fbu809G7kbxdJT6yA9XuP9Ix7pwxzJA8WLMwE57Z7j+zWnNuhGmEPL/9eVVr3u4/tJ2Ol83fgrx689O/a+PuP4czy5J3Gow8rdNamZ/o7j/62dFKj3uQvGa2jSkH7u4/uq7cVtnDVbz7FU+4ovPuP0D2pj0OpJC8OlnljXL57j80k6049NZovEde+/J2/+4/NYpYa+LukbxKBqEwsAXvP83dXwrX/3Q80sFLkB4M7z+smJL6+72RvAke11vCEu8/swyvMK5uczycUoXdmxnvP5T9n1wy4448etD/X6sg7z+sWQnRj+CEPEvRVy7xJ+8/ZxpOOK/NYzy15waUbS/vP2gZkmwsa2c8aZDv3CA37z/StcyDGIqAvPrDXVULP+8/b/r/P12tj7x8iQdKLUfvP0mpdTiuDZC88okNCIdP7z+nBz2mhaN0PIek+9wYWO8/DyJAIJ6RgryYg8kW42DvP6ySwdVQWo48hTLbA+Zp7z9LawGsWTqEPGC0AfMhc+8/Hz60ByHVgrxfm3szl3zvP8kNRzu5Kom8KaH1FEaG7z/TiDpgBLZ0PPY/i+cukO8/cXKdUezFgzyDTMf7UZrvP/CR048S94+82pCkoq+k7z99dCPimK6NvPFnji1Ir+8/CCCqQbzDjjwnWmHuG7rvPzLrqcOUK4Q8l7prNyvF7z/uhdExqWSKPEBFblt20O8/7eM75Lo3jrwUvpyt/dvvP53NkU07iXc82JCegcHn7z+JzGBBwQVTPPFxjyvC8+8/AEHwLwsDYBwB";return f}var wasmBinaryFile;function getBinarySync(file){if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}var binary=tryParseAsDataURI(file);if(binary){return binary}if(readBinary){return readBinary(file)}throw"both async and sync fetching of the wasm failed"}function getBinaryPromise(binaryFile){return Promise.resolve().then(()=>getBinarySync(binaryFile))}function instantiateArrayBuffer(binaryFile,imports,receiver){return getBinaryPromise(binaryFile).then(binary=>WebAssembly.instantiate(binary,imports)).then(receiver,reason=>{err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason)})}function instantiateAsync(binary,binaryFile,imports,callback){return instantiateArrayBuffer(binaryFile,imports,callback)}function getWasmImports(){return{a:wasmImports}}function createWasm(){function receiveInstance(instance,module){wasmExports=instance.exports;wasmMemory=wasmExports["e"];updateMemoryViews();addOnInit(wasmExports["f"]);removeRunDependency("wasm-instantiate");return wasmExports}addRunDependency("wasm-instantiate");function receiveInstantiationResult(result){receiveInstance(result["instance"])}var info=getWasmImports();wasmBinaryFile??=findWasmBinary();instantiateAsync(wasmBinary,wasmBinaryFile,info,receiveInstantiationResult).catch(readyPromiseReject);return{}}class ExitStatus{name="ExitStatus";constructor(status){this.message=`Program terminated with exit(${status})`;this.status=status}}var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module)}};var __abort_js=()=>abort("");var __emscripten_memcpy_js=(dest,src,num)=>HEAPU8.copyWithin(dest,src,src+num);var getHeapMax=()=>2147483648;var alignMemory=(size,alignment)=>Math.ceil(size/alignment)*alignment;var abortOnCannotGrowMemory=requestedSize=>{abort("OOM")};var growMemory=size=>{var b=wasmMemory.buffer;var pages=(size-b.byteLength+65535)/65536|0;try{wasmMemory.grow(pages);updateMemoryViews();return 1}catch(e){}};var _emscripten_resize_heap=requestedSize=>{var oldSize=HEAPU8.length;requestedSize>>>=0;var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize){abortOnCannotGrowMemory(requestedSize)}for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.5/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignMemory(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=growMemory(newSize);if(replacement){return true}}abortOnCannotGrowMemory(requestedSize)};var initRandomFill=()=>{if(typeof crypto=="object"&&typeof crypto["getRandomValues"]=="function"){return view=>crypto.getRandomValues(view)}else abort("initRandomDevice")};var randomFill=view=>(randomFill=initRandomFill())(view);var _random_get=(buffer,size)=>{randomFill(HEAPU8.subarray(buffer,buffer+size));return 0};var keepRuntimeAlive=()=>true;var _proc_exit=code=>{EXITSTATUS=code;if(!keepRuntimeAlive()){ABORT=true}quit_(code,new ExitStatus(code))};var exitJS=(status,implicit)=>{EXITSTATUS=status;_proc_exit(status)};var handleException=e=>{if(e instanceof ExitStatus||e=="unwind"){return EXITSTATUS}quit_(1,e)};var UTF8Decoder=typeof TextDecoder!="undefined"?new TextDecoder:undefined;var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead=NaN)=>{var endIdx=idx+maxBytesToRead;var endPtr=idx;while(heapOrArray[endPtr]&&!(endPtr>=endIdx))++endPtr;if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.subarray(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}return str};var UTF8ToString=(ptr,maxBytesToRead)=>ptr?UTF8ArrayToString(HEAPU8,ptr,maxBytesToRead):"";var wasmImports={d:__abort_js,c:__emscripten_memcpy_js,b:_emscripten_resize_heap,a:_random_get};var wasmExports=createWasm();var ___wasm_call_ctors=()=>(___wasm_call_ctors=wasmExports["f"])();var _setBuffers=Module["_setBuffers"]=(a0,a1)=>(_setBuffers=Module["_setBuffers"]=wasmExports["h"])(a0,a1);var _blockSamples=Module["_blockSamples"]=()=>(_blockSamples=Module["_blockSamples"]=wasmExports["i"])();var _intervalSamples=Module["_intervalSamples"]=()=>(_intervalSamples=Module["_intervalSamples"]=wasmExports["j"])();var _inputLatency=Module["_inputLatency"]=()=>(_inputLatency=Module["_inputLatency"]=wasmExports["k"])();var _outputLatency=Module["_outputLatency"]=()=>(_outputLatency=Module["_outputLatency"]=wasmExports["l"])();var _reset=Module["_reset"]=()=>(_reset=Module["_reset"]=wasmExports["m"])();var _presetDefault=Module["_presetDefault"]=(a0,a1)=>(_presetDefault=Module["_presetDefault"]=wasmExports["n"])(a0,a1);var _presetCheaper=Module["_presetCheaper"]=(a0,a1)=>(_presetCheaper=Module["_presetCheaper"]=wasmExports["o"])(a0,a1);var _configure=Module["_configure"]=(a0,a1,a2,a3)=>(_configure=Module["_configure"]=wasmExports["p"])(a0,a1,a2,a3);var _setTransposeFactor=Module["_setTransposeFactor"]=(a0,a1)=>(_setTransposeFactor=Module["_setTransposeFactor"]=wasmExports["q"])(a0,a1);var _setTransposeSemitones=Module["_setTransposeSemitones"]=(a0,a1)=>(_setTransposeSemitones=Module["_setTransposeSemitones"]=wasmExports["r"])(a0,a1);var _setFormantFactor=Module["_setFormantFactor"]=(a0,a1)=>(_setFormantFactor=Module["_setFormantFactor"]=wasmExports["s"])(a0,a1);var _setFormantSemitones=Module["_setFormantSemitones"]=(a0,a1)=>(_setFormantSemitones=Module["_setFormantSemitones"]=wasmExports["t"])(a0,a1);var _setFormantBase=Module["_setFormantBase"]=a0=>(_setFormantBase=Module["_setFormantBase"]=wasmExports["u"])(a0);var _seek=Module["_seek"]=(a0,a1)=>(_seek=Module["_seek"]=wasmExports["v"])(a0,a1);var _process=Module["_process"]=(a0,a1)=>(_process=Module["_process"]=wasmExports["w"])(a0,a1);var _flush=Module["_flush"]=a0=>(_flush=Module["_flush"]=wasmExports["x"])(a0);var _main=Module["_main"]=(a0,a1)=>(_main=Module["_main"]=wasmExports["y"])(a0,a1);Module["UTF8ToString"]=UTF8ToString;var calledRun;dependenciesFulfilled=function runCaller(){if(!calledRun)run();if(!calledRun)dependenciesFulfilled=runCaller};function callMain(){var entryFunction=_main;var argc=0;var argv=0;try{var ret=entryFunction(argc,argv);exitJS(ret,true);return ret}catch(e){return handleException(e)}}function run(){if(runDependencies>0){return}preRun();if(runDependencies>0){return}function doRun(){if(calledRun)return;calledRun=true;Module["calledRun"]=true;if(ABORT)return;initRuntime();preMain();readyPromiseResolve(Module);if(shouldRunNow)callMain();postRun()}{doRun()}}var shouldRunNow=true;run();moduleRtn=readyPromise;


  return moduleRtn;
}
);
})();
if (typeof define === 'function' && define['amd'])
  define([], () => SignalsmithStretch);
function registerWorkletProcessor(Module, audioNodeKey) {
	class WasmProcessor extends AudioWorkletProcessor {
		constructor(options) {
			super(options);
			this.wasmReady = false;
			this.wasmModule = null;
			this.channels = 0;
			this.buffersIn = [];
			this.buffersOut = [];
			
			this.audioBuffers = []; // list of (multi-channel) audio buffers
			this.audioBuffersStart = 0; // time-stamp for the first audio buffer
			this.audioBuffersEnd = 0; // just to be helpful
			
			this.timeIntervalSamples = sampleRate*0.1;
			this.timeIntervalCounter = 0;
			
			this.timeMap = [{
				active: false,
				input: 0,
				output: 0,
				rate: 1,
				semitones: 0,
				tonalityHz: 8000,
				formantSemitones: 0,
				formantCompensation: false,
				formantBaseHz: 0, /* 0 = attempt to detect */
				loopStart: 0,
				loopEnd: 0
			}];
			
			let remoteMethods = {
				configure: config => {
					Object.assign(this.config, config);
					this.configure();
				},
				latency: _ => {
					return this.inputLatencySeconds + this.outputLatencySeconds;
				},
				setUpdateInterval: seconds => {
					this.timeIntervalSamples = sampleRate*seconds;
				},
				stop: when => {
					if (typeof when !== 'number') when = currentTime;
					return remoteMethods.schedule({active: false, output: when});
				},
				start: (when, offset, duration, rate, semitones) => {
					if (typeof when === 'object') {
						if (!('active' in when)) when.active = true;
						return remoteMethods.schedule(when);
					}
					
					let obj = {active: true, input: 0, output: currentTime + this.outputLatencySeconds};
					if (typeof when === 'number') obj.output = when;
					if (typeof offset === 'number') obj.input = offset;
					if (typeof rate === 'number') obj.rate = rate;
					if (typeof semitones === 'number') obj.semitones = semitones;
					let result = remoteMethods.schedule(obj);
					if (typeof duration === 'number') {
						remoteMethods.stop(obj.output + duration);
						obj.output += duration;
						obj.active = false;
						remoteMethods.schedule(obj);
					}
					return result;
				},
				schedule: (objIn, adjustPrevious) => {
					let outputTime = ('outputTime' in objIn) ? objIn.outputTime : currentTime;

					let latestSegment = this.timeMap[this.timeMap.length - 1];
					while (this.timeMap.length && this.timeMap[this.timeMap.length - 1].output >= outputTime) {
						latestSegment = this.timeMap.pop();
					}

					let obj = Object.assign({}, latestSegment);
					Object.assign(obj, {
						input: null,
						output: outputTime,
					});
					Object.assign(obj, objIn);
					if (obj.input === null) {
						let rate = (latestSegment.active ? latestSegment.rate : 0);
						obj.input = latestSegment.input + (obj.output - latestSegment.output)*rate;
					}
					this.timeMap.push(obj);

					if (adjustPrevious && this.timeMap.length > 1) {
						let previous = this.timeMap[this.timeMap.length - 2];
						if (previous.output < currentTime) {
							let rate = (previous.active ? previous.rate : 0);
							previous.input += (currentTime - previous.output)*rate;
							previous.output = currentTime;
						}
						previous.rate = (obj.input - previous.input)/(obj.output - previous.output);
					}
	
					let currentMapSegment = this.timeMap[0];
					while (this.timeMap.length > 1 && this.timeMap[1].output <= outputTime) {
						this.timeMap.shift();
						currentMapSegment = this.timeMap[0];
					}
					let rate = (currentMapSegment.active ? currentMapSegment.rate : 0);
					let inputTime = currentMapSegment.input + (outputTime - currentMapSegment.output)*rate;
					this.timeIntervalCounter = this.timeIntervalSamples;
					this.port.postMessage(['time', inputTime]);
					
					return obj;
				},
				dropBuffers: toSeconds => {
					if (typeof toSeconds !== 'number') {
						let buffers = this.audioBuffers.flat(1).map(b => b.buffer);
						this.audioBuffers = [];
						this.audioBuffersStart = this.audioBuffersEnd = 0;
						return {
							value: {start: 0, end: 0},
							transfer: buffers
						};
					}
					let transfer = [];
					while (this.audioBuffers.length) {
						let first = this.audioBuffers[0];
						let length = first[0].length;
						let endSamples = this.audioBuffersStart + length;
						let endSeconds = endSamples/sampleRate;
						if (endSeconds > toSeconds) break;

						this.audioBuffers.shift().forEach(b => transfer.push(b.buffer));
						this.audioBuffersStart += length;
					}
					return {
						value: {
							start: this.audioBuffersStart/sampleRate,
							end: this.audioBuffersEnd/sampleRate
						},
						transfer: transfer
					};
				},
				addBuffers: sampleBuffers => {
					sampleBuffers = [].concat(sampleBuffers);
					this.audioBuffers.push(sampleBuffers);
					let length = sampleBuffers[0].length;
					this.audioBuffersEnd += length;
					return this.audioBuffersEnd/sampleRate;
				}
			};

			let pendingMessages = [];
			this.port.onmessage = event => pendingMessages.push(event);

			Module().then(wasmModule => {
				this.wasmModule = wasmModule;
				this.wasmReady = true;

				wasmModule._main();

				this.channels = options.numberOfOutputs ? options.outputChannelCount[0] : 2; // stereo by default
				this.configure();

				this.port.onmessage = event => {
					let data = event.data;
					let messageId = data.shift();
					let method = data.shift();
					let result = remoteMethods[method](...data);
					if (result?.transfer) {
						this.port.postMessage([messageId, result.value], result.transfer);
					} else {
						this.port.postMessage([messageId, result]);
					}
				};
				let methodArgCounts = {};
				for (let key in remoteMethods) {
					methodArgCounts[key] = remoteMethods[key].length;
				}
				this.port.postMessage(['ready', methodArgCounts]);
				pendingMessages.forEach(this.port.onmessage);
				pendingMessages = null;
			});
		}
		
		config = {
			preset: 'default'
		};
		configure() {
			if (this.config.blockMs) {
				let blockSamples = Math.round(this.config.blockMs/1000*sampleRate);
				let intervalSamples = Math.round((this.config.intervalMs || this.config.blockMs*0.25)/1000*sampleRate);
				let splitComputation = this.config.splitComputation;
				this.wasmModule._configure(this.channels, blockSamples, intervalSamples, splitComputation);
				this.wasmModule._reset();
			} else if (this.config.preset == 'cheaper') {
				this.wasmModule._presetCheaper(this.channels, sampleRate);
			} else {
				this.wasmModule._presetDefault(this.channels, sampleRate);
			}
			this.updateBuffers();
			this.inputLatencySeconds = this.wasmModule._inputLatency()/sampleRate;
			this.outputLatencySeconds = this.wasmModule._outputLatency()/sampleRate;
		}
		
		updateBuffers() {
			let wasmModule = this.wasmModule;
			// longer than one STFT block, so we can seek smoothly
			this.bufferLength = (wasmModule._inputLatency() + wasmModule._outputLatency());
			
			let lengthBytes = this.bufferLength*4;
			let bufferPointer = wasmModule._setBuffers(this.channels, this.bufferLength);
			this.buffersIn = [];
			this.buffersOut = [];
			for (let c = 0; c < this.channels; ++c) {
				this.buffersIn.push(bufferPointer + lengthBytes*c);
				this.buffersOut.push(bufferPointer + lengthBytes*(c + this.channels));
			}
		}

		process(inputList, outputList, parameters) {
			if (!this.wasmReady) {
				outputList.forEach(output => {
					output.forEach(channel => {
						channel.fill(0);
					});
				});
				return true;
			}
			if (!outputList[0]?.length) return false;

			let outputTime = currentTime + this.outputLatencySeconds;
			while (this.timeMap.length > 1 && this.timeMap[1].output <= outputTime) {
				this.timeMap.shift();
			}
			let currentMapSegment = this.timeMap[0];

			let wasmModule = this.wasmModule;
			wasmModule._setTransposeSemitones(currentMapSegment.semitones, currentMapSegment.tonalityHz/sampleRate);
			wasmModule._setFormantSemitones(currentMapSegment.formantSemitones, currentMapSegment.formantCompensation);
			wasmModule._setFormantBase(currentMapSegment.formantBaseHz/sampleRate);

			// Check the input/output channel counts
			if (outputList[0].length != this.channels) {
				this.channels = outputList[0]?.length || 0;
				configure();
			}
			let outputBlockSize = outputList[0][0].length;

			let memory = wasmModule.exports ? wasmModule.exports.memory.buffer : wasmModule.HEAP8.buffer;
			// Buffer list (one per channel)
			let inputs = inputList[0];
			if (!currentMapSegment.active) {
				outputList[0].forEach((_, c) => {
					let channelBuffer = inputs[c%inputs.length];
					let buffer = new Float32Array(memory, this.buffersIn[c], outputBlockSize);
					buffer.fill(0);
				});
				// Should detect silent input and skip processing
				wasmModule._process(outputBlockSize, outputBlockSize);
			} else if (inputs?.length) {
				// Live input
				outputList[0].forEach((_, c) => {
					let channelBuffer = inputs[c%inputs.length];
					let buffer = new Float32Array(memory, this.buffersIn[c], outputBlockSize);
					if (channelBuffer) {
						buffer.set(channelBuffer);
					} else {
						buffer.fill(0);
					}
				})
				wasmModule._process(outputBlockSize, outputBlockSize);
			} else {
				let inputTime = currentMapSegment.input + (outputTime - currentMapSegment.output)*currentMapSegment.rate;
				let loopLength = currentMapSegment.loopEnd - currentMapSegment.loopStart;
				if (loopLength > 0 && inputTime >= currentMapSegment.loopEnd) {
					currentMapSegment.input -= loopLength;
					inputTime -= loopLength;
				}
				
				inputTime += this.inputLatencySeconds;
				let inputSamplesEnd = Math.round(inputTime*sampleRate);

				// Fill the buffer with previous input
				let buffers = outputList[0].map((_, c) => new Float32Array(memory, this.buffersIn[c], this.bufferLength));

				let blockSamples = 0; // current write position in the temporary input buffer
				let audioBufferIndex = 0;
				let audioSamples = this.audioBuffersStart; // start of current audio buffer
				// zero-pad until the start of the audio data
				let inputSamples = inputSamplesEnd - this.bufferLength;
				if (inputSamples < audioSamples) {
					blockSamples = audioSamples - inputSamples;
					buffers.forEach(b => b.fill(0, 0, blockSamples));
					inputSamples = audioSamples;
				}
				while (audioBufferIndex < this.audioBuffers.length && audioSamples < inputSamplesEnd) {
					let audioBuffer = this.audioBuffers[audioBufferIndex];
					let startIndex = inputSamples - audioSamples; // start index within the audio buffer
					let bufferEnd = audioSamples + audioBuffer[0].length;
					// how many samples to copy: min(how many left in the buffer, how many more we need)
					let count = Math.min(audioBuffer[0].length - startIndex, inputSamplesEnd - inputSamples);
					if (count > 0) {
						buffers.forEach((buffer, c) => {
							let channelBuffer = audioBuffer[c%audioBuffer.length];
							buffer.subarray(blockSamples).set(channelBuffer.subarray(startIndex, startIndex + count));
						});
						audioSamples += count;
						blockSamples += count;
					} else { // we're already past this buffer - skip it
						audioSamples += audioBuffer[0].length;
					}
					++audioBufferIndex;
				}
				if (blockSamples < this.bufferLength) {
					buffers.forEach(buffer => buffer.subarray(blockSamples).fill(0));
				}

				// constantly seeking, so we don't have to worry about the input buffers needing to be a rate-dependent size
				wasmModule._seek(this.bufferLength, currentMapSegment.rate);
				wasmModule._process(0, outputBlockSize);

				this.timeIntervalCounter -= outputBlockSize;
				if (this.timeIntervalCounter <= 0) {
					this.timeIntervalCounter = this.timeIntervalSamples;
					this.port.postMessage(['time', inputTime]);
				}
			}
			
			// Re-fetch in case the memory changed (even though there *shouldn't* be any allocations)
			memory = wasmModule.exports ? wasmModule.exports.memory.buffer : wasmModule.HEAP8.buffer;
			outputList[0].forEach((channelBuffer, c) => {
				let buffer = new Float32Array(memory, this.buffersOut[c], outputBlockSize);
				channelBuffer.set(buffer);
			});
			
			return true;
		}
	}

	registerProcessor(audioNodeKey, WasmProcessor);
}

/**
	Creates a Stretch node
	@async
	@function SignalsmithStretch
	@param {AudioContext} audioContext
	@param {Object} options - channel configuration (as per [options]{@link https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode/AudioWorkletNode#options})
	@returns {Promise<StretchNode>}
*/
SignalsmithStretch = ((Module, audioNodeKey) => {
	if (typeof AudioWorkletProcessor === "function" && typeof registerProcessor === "function") {
		// AudioWorklet side
		registerWorkletProcessor(Module, audioNodeKey);
		return {};
	}
	let promiseKey = Symbol();
	let createNode = async function(audioContext, options) {
		/**
			@classdesc An `AudioWorkletNode` with Signalsmith Stretch extensions
			@name StretchNode
			@augments AudioWorkletNode
			@property {number} inputTime - the current playback (in seconds) within the input audio stored by the node
		 */
		let audioNode;
		options = options || {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [2]
		};
		try {
			audioNode = new AudioWorkletNode(audioContext, audioNodeKey, options);
		} catch (e) {
			if (!audioContext[promiseKey]) {
				let moduleUrl = createNode.moduleUrl;
				if (!moduleUrl) {
					let moduleCode = `(${registerWorkletProcessor})((_scriptName=>${Module})(),${JSON.stringify(audioNodeKey)})`;
					moduleUrl = URL.createObjectURL(new Blob([moduleCode], {type: 'text/javascript'}));
				}
				audioContext[promiseKey] = audioContext.audioWorklet.addModule(moduleUrl);
			}
			await audioContext[promiseKey];
			audioNode = new AudioWorkletNode(audioContext, audioNodeKey, options);
		}

		// messages with Promise responses
		let requestMap = {};
		let idCounter = 0;
		let timeUpdateCallback = null;
		let post = (transfer, ...data) => {
			let id = idCounter++;
			return new Promise(resolve => {
				requestMap[id] = resolve;
				audioNode.port.postMessage([id].concat(data), transfer);
			});
		};
		audioNode.inputTime = 0;
		audioNode.port.onmessage = (event) => {
			let data = event.data;
			let id = data[0], value = data[1];
			if (id == 'time') {
				audioNode.inputTime = value;
				if (timeUpdateCallback) timeUpdateCallback(value);
			}
			if (id in requestMap) {
				requestMap[id](value);
				delete requestMap[id];
			}
		};
		
		return new Promise(resolve => {
			requestMap['ready'] = remoteMethodKeys => {
				Object.keys(remoteMethodKeys).forEach(key => {
					let argCount = remoteMethodKeys[key];
					audioNode[key] = (...args) => {
						let transfer = null;
						if (args.length > argCount) {
							transfer = args.pop();
						}
						return post(transfer, key, ...args);
					}
				});
				/** @lends StretchNode.prototype
					@method setUpdateInterval
				*/
				audioNode.setUpdateInterval = (seconds, callback) => {
					timeUpdateCallback = callback;
					return post(null, 'setUpdateInterval', seconds);
				}
				resolve(audioNode);
			}
		});
	};
	return createNode;
})(SignalsmithStretch, "signalsmith-stretch");
// register as an AMD module
if (typeof define === 'function' && define['amd']) {
	define([], () => SignalsmithStretch);
}

// endregion
