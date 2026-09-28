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
    onSingleClick?: (tap: unknown) => void;
    onDoubleClick?: (tap: unknown) => void;
    onSingleTap?: (tap: unknown) => void;
    onDoubleTap?: (tap: unknown) => void;
    videoId?: string;
    playerContainer?: HTMLElement;
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
    listKeyboardShortcuts: () => Array<{ id: string; keys: string[]; message: string }>;
    setTouchGestures: (enabled: boolean) => boolean;
    resumeWatchProgress: () => boolean;
    destroy: () => void;
};

export function formatTime(seconds: number): string;
export function createVideo(video: HTMLVideoElement, config?: VideoConfig): VideoEngine;
