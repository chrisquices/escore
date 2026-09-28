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
    bufferedRanges: Array<{ startPercent: number; endPercent: number }>;
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
    listKeyboardShortcuts: () => Array<{ id: string; keys: string[]; message: string }>;
    resumeWatchProgress: () => boolean;
    destroy: () => void;
};

export function formatTime(seconds: number): string;
export function createAudio(audio: HTMLAudioElement, config?: AudioConfig): AudioEngine;
