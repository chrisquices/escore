<script setup lang="ts">
import type {Component, HTMLAttributes} from "vue"
import {
  AlertTriangle,
  Captions,
  Keyboard,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  Volume1,
  Volume2,
  VolumeX,
} from "@lucide/vue"
import {computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch} from "vue"
import {
  createVideo,
  type VideoCaption,
  type VideoConfig,
  type VideoEngine,
  type VideoError,
  type VideoMediaSession,
  type VideoSource
} from "escore-packages/ui-interactions/video"
import {cn} from "escore-packages/ui/utils"
import {Button} from "escore-packages/ui/button"
import {Caption} from "escore-packages/ui/caption"
import {Field, FieldTitle} from "escore-packages/ui/field"
import {Kbd, KbdGroup} from "escore-packages/ui/kbd"
import {Label} from "escore-packages/ui/label"
import {RadioGroup, RadioGroupItem} from "escore-packages/ui/radio-group"
import {Separator} from "escore-packages/ui/separator"
import {Slider} from "escore-packages/ui/slider"
import {Switch} from "escore-packages/ui/switch"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "escore-packages/ui/sheet"
import {Card, CardContent} from "escore-packages/ui/card"

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  playerId: string
  title?: string
  poster?: string
  thumbnails?: string
  muted?: boolean
  sources: VideoSource[]
  captions?: VideoCaption[]
  mediaSession?: VideoMediaSession
  config?: Partial<VideoConfig>
  class?: HTMLAttributes["class"]
}>(), {
  config: () => ({}),
})

const playerDomId = (suffix: string) => `${props.playerId}-${suffix}`

const playerContainer = ref<HTMLElement | null>(null)
const videoElement = ref<HTMLVideoElement | null>(null)
const progressContainer = ref<HTMLElement | null>(null)
const videoEngine = shallowRef<VideoEngine | null>(null)
const videoError = ref<VideoError | null>(null)
const captionsPanel = ref<HTMLElement | null>(null)
const settingsPanel = ref<HTMLElement | null>(null)
const shortcutsPanel = ref<HTMLElement | null>(null)
const captionsSheetOpen = ref(false)
const settingsSheetOpen = ref(false)
const shortcutsSheetOpen = ref(false)
const resumePromptDismissed = ref(false)
const statusOverlay = ref<{
  icon: Component
  label: string
  detail?: string
} | null>(null)
const seekPreview = ref<{
  percent: number
  time: number
  timeFormatted: string
  remainingTime: number
  remainingTimeFormatted: string
  thumbnail: null | {
    src: string
    x: number
    y: number
    width: number
    height: number
    style: Record<string, string>
  }
} | null>(null)
let statusOverlayTimeout: ReturnType<typeof setTimeout> | null = null
let suppressSeekStatusOverlay = false
let lastStatusSnapshot: {
  currentTime: number
  muted: boolean
  volume: number
  captionSrc: string
  captionEnabled: boolean
  captionLabel: string
  captionLanguage: string
} | null = null

const mediaSession = computed(() => ({
  title: props.mediaSession?.title || props.title || "",
  artist: props.mediaSession?.artist || "",
  album: props.mediaSession?.album || "",
  artwork: props.mediaSession?.artwork || [],
}))

function createVideoEngine() {
  if (!videoElement.value || !playerContainer.value) return

  videoEngine.value?.destroy()
  videoError.value = null
  resumePromptDismissed.value = false
  lastStatusSnapshot = null

  videoEngine.value = createVideo(videoElement.value, {
    ...props.config,
    videoId: props.playerId,
    playerContainer: playerContainer.value,
    autoplayMuted: props.muted ?? props.config.autoplayMuted,
    poster: props.config.poster ?? props.poster,
    thumbnails: props.config.thumbnails ?? props.thumbnails,
    captions: props.config.captions ?? props.captions,
    sources: props.config.sources ?? props.sources,
    mediaSession: props.config.mediaSession ?? mediaSession.value,
    onChange(state) {
      triggerRef(videoEngine)
      props.config.onChange?.(state)
    },
    onError(error: VideoError) {
      videoError.value = error
      props.config.onError?.(error)
    },
  })

  if (props.muted !== undefined) {
    videoEngine.value.setMuted(props.muted)
  }
}

onMounted(() => {
  createVideoEngine()
})

watch(
  () => props.sources,
  (sources) => {
    if (props.config.sources) return

    videoEngine.value?.setSources(sources)
  },
  {deep: true},
)

watch(
  mediaSession,
  (nextMediaSession) => {
    if (props.config.mediaSession) return

    videoEngine.value?.setMediaSession(nextMediaSession)
  },
  {deep: true},
)

watch(
  () => props.config,
  () => {
    createVideoEngine()
  },
  {deep: true},
)

watch(
  () => props.muted,
  (muted) => {
    if (muted === undefined) return

    videoEngine.value?.setMuted(muted)
  },
)

onBeforeUnmount(() => {
  if (statusOverlayTimeout) {
    clearTimeout(statusOverlayTimeout)
  }

  videoEngine.value?.destroy()
})

const state = computed(() => videoEngine.value?.getState() ?? null)
const isSheetOpen = computed(() => captionsSheetOpen.value || settingsSheetOpen.value || shortcutsSheetOpen.value)
const isPlaying = computed(() => !!state.value?.playing)
const isBuffering = computed(() => !!state.value?.buffering)
const isMuted = computed(() => !!state.value?.muted)
const isFullscreen = computed(() => !!state.value?.fullscreen)
const isFullscreenSupported = computed(() => !!state.value?.fullscreenSupported)
const isPictureInPicture = computed(() => !!state.value?.pictureInPicture)
const isPictureInPictureSupported = computed(() => !!state.value?.pictureInPictureSupported)
const abLoopPhase = computed(() => state.value?.abLoopPhase ?? "idle")
const currentTimeFormatted = computed(() => state.value?.currentTimeFormatted ?? "0:00")
const duration = computed(() => state.value?.duration ?? 0)
const durationFormatted = computed(() => state.value?.durationFormatted ?? "0:00")
const remainingTimeFormatted = computed(() => state.value?.remainingTimeFormatted ?? "-0:00")
const bufferedRanges = computed(() => (state.value?.bufferedRanges ?? [])
  .map((range) => {
    const startPercent = Math.max(0, Math.min(range.startPercent, 100))
    const endPercent = Math.max(startPercent, Math.min(range.endPercent, 100))

    return {
      startPercent,
      widthPercent: endPercent - startPercent,
    }
  })
  .filter(range => range.widthPercent > 0)
)
const watchProgressState = computed(() => state.value?.watchProgress ?? {
  enabled: false,
  restored: false,
  savedTime: 0,
  savedTimeFormatted: "0:00",
  watchedPercent: 0,
})
const captionsState = computed(() => state.value?.captions ?? {
  enabled: false,
  src: "",
  language: "",
  label: "",
  tracks: [] as Array<{
    src: string,
    language: string,
    label: string,
    kind: string,
    active: boolean,
    readyState: number
  }>
})
const captionTracks = computed(() => captionsState.value.tracks)
const keyboardShortcuts = computed(() => videoEngine.value?.listKeyboardShortcuts() ?? [])
const canResumeWatchProgress = computed(() => (
  watchProgressState.value.enabled &&
  !watchProgressState.value.restored &&
  watchProgressState.value.savedTime > 0 &&
  watchProgressState.value.watchedPercent < 98
))
const showResumePrompt = computed(() => canResumeWatchProgress.value && !resumePromptDismissed.value)

watch(
  () => [videoEngine.value, showResumePrompt.value] as const,
  ([engine, shouldBlockPlayback]) => {
    engine?.setKeyboardShortcuts((props.config.keyboardShortcuts ?? true) && !shouldBlockPlayback)
  },
  {immediate: true},
)

const progress = computed({
  get() {
    return [state.value?.currentTime ?? 0]
  },
  set(val) {
    videoEngine.value?.seek(val[0])
  },
})

const volume = computed({
  get() {
    return [state.value?.muted ? 0 : Math.round((state.value?.volume ?? 0.8) * 100)]
  },
  set(val) {
    videoEngine.value?.setVolume(val[0] / 100)
  },
})

const playbackRate = computed({
  get() {
    return [state.value?.playbackRate ?? 1]
  },
  set(val) {
    videoEngine.value?.setPlaybackRate(val[0])
  },
})

const autoplayEnabled = computed({
  get() {
    return !!state.value?.autoplay
  },
  set(val) {
    void videoEngine.value?.setAutoplay(val)
  },
})

const loopEnabled = computed({
  get() {
    return !!state.value?.loop
  },
  set(val) {
    videoEngine.value?.setLoop(val)
  },
})

const captionsTrack = computed({
  get() {
    return captionsState.value.enabled ? captionsState.value.src : "off"
  },
  set(val) {
    if (val === "off") {
      videoEngine.value?.setCaption(null)
      return
    }

    const nextTrack = captionTracks.value.find(track => track.src === val)
    if (nextTrack) {
      videoEngine.value?.setCaption(nextTrack)
    }
  },
})

const captionsStatus = computed(() => {
  if (!captionsState.value.enabled) {
    return "OFF"
  }

  return captionDisplayCode(captionsState.value)
})
const blockingVideoError = computed(() => {
  if (!videoError.value) return null

  return [
    "loading-aborted",
    "network-error",
    "decode-error",
    "unsupported-source",
    "media-error",
    "playback-blocked",
    "playback-failed",
  ].includes(videoError.value.id)
    ? videoError.value
    : null
})

const volumeIcon = computed(() => {
  if (isMuted.value || volume.value[0] === 0) {
    return VolumeX
  }

  return volume.value[0] < 50 ? Volume1 : Volume2
})
const showCenterOverlay = computed(() => (
  !showResumePrompt.value &&
  !blockingVideoError.value &&
  (Boolean(statusOverlay.value) || isBuffering.value || !isPlaying.value)
))
const centerOverlayIcon = computed(() => statusOverlay.value?.icon ?? (isBuffering.value ? LoaderCircle : Play))
const centerOverlayLabel = computed(() => statusOverlay.value?.label ?? (isBuffering.value ? null : "Paused"))
const centerOverlayDetail = computed(() => statusOverlay.value?.detail)
const isCenterOverlayLoading = computed(() => !statusOverlay.value && isBuffering.value)

watch(state, (nextState) => {
  if (!nextState) return

  const nextSnapshot = {
    currentTime: nextState.currentTime,
    muted: nextState.muted,
    volume: Math.round(nextState.volume * 100),
    captionSrc: nextState.captions.src,
    captionEnabled: nextState.captions.enabled,
    captionLabel: nextState.captions.label,
    captionLanguage: nextState.captions.language,
  }

  if (!lastStatusSnapshot) {
    lastStatusSnapshot = nextSnapshot
    return
  }

  if (lastStatusSnapshot.muted !== nextSnapshot.muted) {
    showStatusOverlay(
      nextSnapshot.muted ? VolumeX : getVolumeIcon(nextSnapshot.volume),
      nextSnapshot.muted ? "Muted" : "Unmuted",
      nextSnapshot.muted ? undefined : `${nextSnapshot.volume}%`,
    )
  } else if (lastStatusSnapshot.volume !== nextSnapshot.volume) {
    showStatusOverlay(
      getVolumeIcon(nextSnapshot.volume),
      nextSnapshot.volume > lastStatusSnapshot.volume ? "Volume up" : "Volume down",
      `${nextSnapshot.volume}%`,
    )
  } else if (
    lastStatusSnapshot.captionSrc !== nextSnapshot.captionSrc ||
    lastStatusSnapshot.captionEnabled !== nextSnapshot.captionEnabled
  ) {
    showStatusOverlay(
      Captions,
      nextSnapshot.captionEnabled ? "Captions on" : "Captions off",
      nextSnapshot.captionEnabled
        ? captionDisplayCode({language: nextSnapshot.captionLanguage, label: nextSnapshot.captionLabel})
        : undefined,
    )
  } else {
    const seekDelta = nextSnapshot.currentTime - lastStatusSnapshot.currentTime

    if (nextState.seeking && Math.abs(seekDelta) >= 2) {
      if (suppressSeekStatusOverlay) {
        suppressSeekStatusOverlay = false
      } else {
        showStatusOverlay(
          seekDelta > 0 ? RotateCw : RotateCcw,
          seekDelta > 0 ? "Seek forward" : "Seek backward",
          `${Math.round(Math.abs(seekDelta))}s`,
        )
      }
    }
  }

  lastStatusSnapshot = nextSnapshot
})

function captionDisplayCode(caption: { language?: string, label?: string }) {
  const language = caption.language?.trim()

  if (language) {
    try {
      return new Intl.Locale(language.replace(/_/g, "-")).language.toUpperCase()
    } catch {
      return language.split(/[-_]/)[0].toUpperCase()
    }
  }

  return (caption.label ?? "").slice(0, 3).toUpperCase()
}

function getVolumeIcon(value: number) {
  if (value <= 0) return VolumeX

  return value < 50 ? Volume1 : Volume2
}

function showStatusOverlay(icon: Component, label: string, detail?: string) {
  statusOverlay.value = {
    icon,
    label,
    detail,
  }

  if (statusOverlayTimeout) {
    clearTimeout(statusOverlayTimeout)
  }

  statusOverlayTimeout = setTimeout(() => {
    statusOverlay.value = null
    statusOverlayTimeout = null
  }, 900)
}

function togglePlayback() {
  if (showResumePrompt.value) return

  videoEngine.value?.togglePlayback()
}

function toggleMuted() {
  videoEngine.value?.toggleMuted()
}

function cycleAB() {
  if (abLoopPhase.value === "idle")
    videoEngine.value?.setAbLoopStart()
  else if (abLoopPhase.value === "pending")
    videoEngine.value?.setAbLoopEnd()
  else
    videoEngine.value?.clearAbLoop()
}

function toggleFullscreen() {
  if (isFullscreen.value)
    void videoEngine.value?.exitFullscreen()
  else
    void videoEngine.value?.enterFullscreen()
}

function togglePictureInPicture() {
  if (isPictureInPicture.value)
    void videoEngine.value?.exitPictureInPicture()
  else
    void videoEngine.value?.enterPictureInPicture()
}

function resumeWatchProgress() {
  resumePromptDismissed.value = true
  suppressSeekStatusOverlay = true
  videoEngine.value?.resumeWatchProgress()
}

function startOverWatchProgress() {
  resumePromptDismissed.value = true
  suppressSeekStatusOverlay = true
  videoEngine.value?.seek(0)
}

function resetPersistedSettings() {
  if (videoEngine.value?.clearPersistedSettings()) {
    showStatusOverlay(RotateCcw, "Settings reset")
  }
}

function resetPlaybackRate() {
  videoEngine.value?.resetPlaybackRate()
}

async function retryVideo() {
  videoError.value = null
  await videoEngine.value?.retry()
}

function formatShortcutKey(key: string) {
  const labels: Record<string, string> = {
    ArrowLeft: "←",
    ArrowRight: "→",
    ArrowUp: "↑",
    ArrowDown: "↓",
    Space: "Space",
    Spacebar: "Space",
  }

  return labels[key] ?? key
}

function onCaptionsOpenAutoFocus(event: Event) {
  event.preventDefault()
  nextTick(() => {
    captionsPanel.value?.focus({preventScroll: true})
  })
}

function onSettingsOpenAutoFocus(event: Event) {
  event.preventDefault()
  nextTick(() => {
    settingsPanel.value?.focus({preventScroll: true})
  })
}

function onShortcutsOpenAutoFocus(event: Event) {
  event.preventDefault()
  nextTick(() => {
    shortcutsPanel.value?.focus({preventScroll: true})
  })
}

function updateSeekPreview(event: PointerEvent | MouseEvent) {
  if (!progressContainer.value || !videoEngine.value) return

  const rect = progressContainer.value.getBoundingClientRect()
  seekPreview.value = videoEngine.value.getSeekPreviewAtPosition(event.clientX - rect.left, rect.width) as typeof seekPreview.value
}

function clearSeekPreview() {
  seekPreview.value = null
}
</script>

<template>
  <div
    ref="playerContainer"
    tabindex="0"
    :class="cn('group/video-player relative aspect-video w-full touch-none overflow-hidden rounded-lg bg-surface select-none outline-hidden focus:outline-hidden focus-visible:outline-hidden', props.class)"
    v-bind="$attrs"
  >
    <video ref="videoElement" class="size-full" preload="metadata" playsinline/>

    <!-- Error Overlay -->
    <div
      v-if="blockingVideoError"
      data-video-controls-bar
      class="absolute inset-0 z-[60] flex items-center justify-center bg-overlay px-4 backdrop-blur-[2px]"
    >
      <div class="flex w-full max-w-sm flex-col items-center gap-3 rounded-md border border-border bg-surface p-4 text-center shadow-raised">
        <div class="flex size-12 items-center justify-center rounded-full border border-border bg-surface-muted text-destructive">
          <AlertTriangle class="size-5"/>
        </div>

        <div class="space-y-1">
          <div class="text-sm font-medium text-foreground">Video could not load</div>
          <p class="text-sm text-foreground-muted">{{ blockingVideoError.message }}</p>
        </div>

        <Button variant="primary" size="sm" class="gap-1.5" @click="retryVideo">
          <RotateCcw class="size-3.5"/>
          Retry
        </Button>
      </div>
    </div>

    <!-- Resume Prompt -->
    <div
      v-if="showResumePrompt"
      data-video-controls-bar
      class="absolute inset-0 z-50 flex items-center justify-center bg-overlay/70 px-4 backdrop-blur-[2px]"
    >
      <div class="flex w-full max-w-sm items-center justify-between gap-3 rounded-md border border-border bg-surface/90 p-3 shadow-raised">
        <div class="min-w-0">
          <div class="text-sm font-medium text-foreground">Resume playback?</div>
          <p class="text-sm text-foreground-muted">Continue from {{ watchProgressState.savedTimeFormatted }}.</p>
        </div>

        <div class="flex flex-none items-center gap-2">
          <Button variant="ghost" size="sm" @click="startOverWatchProgress">
            Start over
          </Button>
          <Button variant="primary" size="sm" @click="resumeWatchProgress">
            Resume
          </Button>
        </div>
      </div>
    </div>

    <!-- Paused Overlay -->
    <div
      class="pointer-events-none absolute inset-0 z-10 bg-overlay/50 transition-opacity duration-200"
      :class="isPlaying ? 'opacity-0' : 'opacity-100'"
    />

    <!-- Title -->
    <div
      class="pointer-events-none absolute top-3 left-4 z-20 text-sm font-medium text-foreground transition-opacity duration-200 text-shadow-raised"
      :class="isPlaying && !isSheetOpen ? 'opacity-0 group-hover/video-player:opacity-100' : 'opacity-100'"
    >
      {{ title }}
    </div>

    <!-- Center Overlay -->
    <div
      class="pointer-events-none absolute inset-0 z-40 flex items-center justify-center transition-all duration-200"
      :class="showCenterOverlay ? 'scale-100 opacity-100' : 'scale-105 opacity-0'"
    >
      <div class="relative flex size-18 items-center justify-center rounded-full bg-surface shadow-raised backdrop-blur-sm">
        <component
          :is="centerOverlayIcon"
          :class="cn('size-6 text-foreground', isCenterOverlayLoading ? 'animate-spin' : '')"
        />

        <div
          v-if="centerOverlayLabel || centerOverlayDetail"
          class="absolute top-full left-1/2 mt-3 flex min-w-24 -translate-x-1/2 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-surface px-3 py-1 text-sm font-medium text-foreground shadow-raised backdrop-blur-sm"
        >
          <span v-if="centerOverlayLabel">{{ centerOverlayLabel }}</span>
          <span v-if="centerOverlayDetail" class="text-foreground-muted tabular-nums">{{ centerOverlayDetail }}</span>
        </div>
      </div>
    </div>

    <!-- Bottom Scrim -->
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-20 bg-linear-to-t from-overlay/50 to-transparent transition-opacity duration-200"
      :class="isPlaying && !isSheetOpen ? 'opacity-0 group-hover/video-player:opacity-100' : 'opacity-100'"
    />

    <!-- Controls -->
    <div
      class="absolute inset-x-0 bottom-0 z-30 flex flex-col gap-2 px-3 pb-3 transition-opacity duration-200"
      :class="isPlaying && !isSheetOpen ? 'opacity-0 group-hover/video-player:opacity-100 focus-within:opacity-100' : 'opacity-100'"
    >
      <!-- Time -->
      <div class="flex items-center justify-between gap-4 px-1 text-sm text-foreground tabular-nums">
        <span>{{ currentTimeFormatted }} / {{ remainingTimeFormatted }}</span>
        <span>{{ durationFormatted }}</span>
      </div>

      <!-- Progress / Seeker -->
      <div
        ref="progressContainer"
        class="relative flex h-5 items-center px-0.5"
        @pointermove="updateSeekPreview"
        @pointerleave="clearSeekPreview"
      >
        <div
          v-if="seekPreview"
          class="pointer-events-none absolute bottom-full z-40 mb-3 flex -translate-x-1/2 flex-col items-center gap-2"
          :style="{ left: `${seekPreview.percent}%` }"
        >
          <div
            v-if="seekPreview.thumbnail"
            class="overflow-hidden rounded-md border border-border bg-surface shadow-lg"
            :style="seekPreview.thumbnail.style"
          />
          <div class="rounded-md bg-surface/90 px-2 py-1 text-sm font-medium tabular-nums text-foreground shadow-lg backdrop-blur-sm">
            {{ seekPreview.timeFormatted }} • {{ seekPreview.remainingTimeFormatted }}
          </div>
        </div>

        <div class="pointer-events-none absolute inset-x-0.5 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-surface-muted">
          <div
            v-for="(range, index) in bufferedRanges"
            :key="index"
            class="absolute top-0 h-full rounded-full bg-foreground/30"
            :style="{
              left: `${range.startPercent}%`,
              width: `${range.widthPercent}%`,
            }"
          />
        </div>

        <Slider
          v-model="progress"
          :max="duration"
          :step="0.1"
          class="relative z-10 cursor-pointer [&_[data-slot=slider-track]]:bg-transparent"
          aria-label="Seek"
        />
      </div>

      <!-- Controls -->
      <div class="flex items-center gap-2">

        <div class="flex items-center rounded-md bg-surface/60 p-1" data-video-controls-bar>

          <!-- Toggle Play -->
          <Button
            variant="ghost"
            size="icon"
            :aria-label="isPlaying ? 'Pause' : 'Play'"
            title="Play/Pause (Space)"
            @click="togglePlayback"
          >
            <Pause v-if="isPlaying"/>
            <Play v-else/>
          </Button>

          <!-- Volume -->
          <div class="group/volume flex items-center">
            <!-- Mute/Unmute -->
            <Button
              variant="ghost"
              size="icon"
              class="shrink-0"
              aria-label="Mute/Unmute"
              title="Mute (M)"
              @click="toggleMuted"
            >
              <component :is="volumeIcon"/>
            </Button>

            <!-- Volume Slider -->
            <div
              class="grid grid-cols-[0fr] transition-[grid-template-columns,padding,opacity] duration-200 ease-out opacity-0 group-hover/volume:grid-cols-[1fr] group-hover/volume:pl-2 group-hover/volume:opacity-100 group-focus-within/volume:grid-cols-[1fr] group-focus-within/volume:pl-2 group-focus-within/volume:opacity-100"
            >
              <div class="min-w-0 overflow-hidden">
                <div class="flex w-32 items-center gap-2 pr-2">
                  <Slider v-model="volume" size="sm" :max="100" :step="1" aria-label="Volume"/>
                  <span class="text-foreground-muted w-10 text-right text-sm tabular-nums">{{ isMuted ? 0 : volume[0] }}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Spacer -->
        <div class="flex-1"/>

        <div class="bg-surface/60 rounded-md p-1 items-center flex" data-video-controls-bar>
          <!-- A·B Loop -->
          <Button
            variant="ghost"
            size="sm"
            :class="cn(abLoopPhase !== 'idle' ? 'bg-primary/15 text-primary hover:bg-primary/15' : 'text-foreground')"
            :aria-label="abLoopPhase === 'idle' ? 'Set A-B loop start' : abLoopPhase === 'pending' ? 'Set A-B loop end' : 'Clear A-B loop'"
            :title="abLoopPhase === 'idle' ? 'Set A-B loop start' : abLoopPhase === 'pending' ? 'Set A-B loop end' : 'Clear A-B loop'"
            @click="cycleAB"
          >
            A·B
          </Button>

          <!-- Captions -->
          <Button @click="captionsSheetOpen = true" variant="ghost" size="sm" aria-label="Captions" title="Captions (C)" class="gap-1.5 px-2">
            <Captions/>
            <span
              class="text-sm font-medium tabular-nums"
              :class="captionsTrack === 'off' ? 'text-foreground-muted' : 'text-foreground'"
            >
              {{ captionsStatus }}
            </span>
          </Button>

          <!-- Picture-in-Picture -->
          <Button
            variant="ghost"
            size="icon"
            :disabled="!isPictureInPictureSupported"
            :class="cn(isPictureInPicture ? 'bg-primary/15 text-primary hover:bg-primary/15' : 'text-foreground')"
            :aria-label="isPictureInPicture ? 'Exit picture-in-picture' : 'Enter picture-in-picture'"
            :title="isPictureInPicture ? 'Exit picture-in-picture' : 'Picture-in-picture'"
            @click="togglePictureInPicture"
          >
            <PictureInPicture2/>
          </Button>

          <!-- Fullscreen -->
          <Button
            variant="ghost"
            size="icon"
            :disabled="!isFullscreenSupported"
            aria-label="Fullscreen"
            title="Fullscreen (F)"
            @click="toggleFullscreen"
          >
            <Minimize v-if="isFullscreen"/>
            <Maximize v-else/>
          </Button>

          <!-- Keyboard Shortcuts -->
          <Button @click="shortcutsSheetOpen = true" variant="ghost" size="icon" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">
            <Keyboard/>
          </Button>

          <!-- Settings -->
          <Button @click="settingsSheetOpen = true" variant="ghost" size="icon" aria-label="Settings" title="Settings">
            <Settings/>
          </Button>
        </div>
      </div>
    </div>
  </div>

  <!-- Captions -->
  <Sheet v-model:open="captionsSheetOpen" :portal-to="playerContainer">
    <SheetContent class="w-80 overflow-hidden sm:max-w-88" @open-auto-focus="onCaptionsOpenAutoFocus">
      <SheetHeader>
        <SheetTitle>Captions</SheetTitle>
      </SheetHeader>

      <div
        ref="captionsPanel"
        tabindex="-1"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 focus:outline-hidden gap-2"
      >
        <Card class="p-0">
          <CardContent class="p-0 gap-4">
            <RadioGroup v-model="captionsTrack" class="gap-4">
              <Field orientation="horizontal" class="pt-4 px-4"
                     :class="{
                      'pb-4': captionTracks.length === 0,
                    }"
              >
                <div>
                  <Label :for="playerDomId('captions-off')">Off</Label>
                  <p class="text-foreground-muted text-sm mt-1">Disable subtitles.</p>
                </div>
                <RadioGroupItem :id="playerDomId('captions-off')" value="off" class="ml-auto"/>
              </Field>

              <Separator v-if="captionTracks.length > 0"/>

              <!-- Shortcuts -->
              <template v-for="(track, index) in captionTracks" :key="`video-player-caption-${track.src}`">
                <Field
                  orientation="horizontal"
                  class="px-4"
                  :class="{
                  'pb-4': index === keyboardShortcuts.length - 1,
                }"
                >
                  <div>
                    <Label :for="playerDomId(`captions-track-${index}`)">({{ captionDisplayCode(track) }}) {{ track.label }}</Label>
                    <p class="text-foreground-muted text-sm mt-1">{{ track.label }}</p>
                  </div>
                  <RadioGroupItem :id="playerDomId(`captions-track-${index}`)" :value="track.src" class="ml-auto"/>
                </Field>

                <Separator v-if="index < captionTracks.length - 1"/>
              </template>
            </RadioGroup>
          </CardContent>
        </Card>
      </div>
    </SheetContent>
  </Sheet>

  <!-- Keyboard Shortcuts -->
  <Sheet v-model:open="shortcutsSheetOpen" :portal-to="playerContainer">
    <SheetContent class="w-80 overflow-hidden sm:max-w-88" @open-auto-focus="onShortcutsOpenAutoFocus">
      <SheetHeader>
        <SheetTitle>Keyboard Shortcuts</SheetTitle>
      </SheetHeader>

      <div
        ref="shortcutsPanel"
        tabindex="-1"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 focus:outline-hidden gap-2"
      >
        <Card class="p-0">
          <CardContent class="p-0 gap-4">

            <!-- Shortcuts -->
            <template v-for="(shortcut, index) in keyboardShortcuts" :key="`video-player-shortcut-${shortcut.id}`">
              <Field
                orientation="horizontal"
                class="px-4"
                :class="{
                  'pt-4': index === 0,
                  'pb-4': index === keyboardShortcuts.length - 1,
                }"
              >
                <div>
                  <Label :for="playerDomId('autoplay')">{{ shortcut.message }}</Label>
                </div>
                <KbdGroup class="ml-auto flex flex-wrap">
                  <Kbd v-for="key in shortcut.keys" :key="key">
                    {{ formatShortcutKey(key) }}
                  </Kbd>
                </KbdGroup>
              </Field>

              <Separator v-if="index < keyboardShortcuts.length - 1"/>
            </template>
          </CardContent>
        </Card>
      </div>
    </SheetContent>
  </Sheet>

  <!-- Playback Settings -->
  <Sheet v-model:open="settingsSheetOpen" :portal-to="playerContainer">
    <SheetContent class="w-full overflow-hidden max-w-80 sm:max-w-96" @open-auto-focus="onSettingsOpenAutoFocus">
      <SheetHeader>
        <SheetTitle>Playback Settings</SheetTitle>
      </SheetHeader>

      <div
        ref="settingsPanel"
        tabindex="-1"
        class="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain p-4 focus:outline-hidden gap-2"
      >
        <Caption variant="muted">Behavior</Caption>

        <Card class="p-0">
          <CardContent class="p-0 gap-4">

            <!-- Autoplay -->
            <Field orientation="horizontal" class="pt-4 px-4">
              <div>
                <Label :for="playerDomId('autoplay')">Autoplay</Label>
                <p class="text-foreground-muted text-sm mt-1">Start playback automatically.</p>
              </div>
              <Switch :id="playerDomId('autoplay')" v-model="autoplayEnabled" class="ml-auto"/>
            </Field>

            <Separator/>

            <!-- Repeat -->
            <Field orientation="horizontal" class="px-4">
              <div>
                <Label :for="playerDomId('loop')">Repeat</Label>
                <p class="text-foreground-muted text-sm mt-1">Replay when the video ends.</p>
              </div>
              <Switch :id="playerDomId('loop')" v-model="loopEnabled" class="ml-auto"/>
            </Field>

            <Separator/>

            <!-- Playback Speed -->
            <Field class="px-4 pb-4">
              <div class="flex items-center justify-between gap-4">
                <div>
                  <Label :for="playerDomId('playbackSpeed')">
                    Playback Speed
                    <b class="font-mono">({{ playbackRate[0].toFixed(2).replace(/\.00$/, "") }}x)</b>
                  </Label>
                  <p class="text-foreground-muted text-sm mt-1">Fine-tune the pace of playback.</p>
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  :disabled="playbackRate[0] === 1"
                  aria-label="Reset playback speed"
                  title="Reset playback speed"
                  @click="resetPlaybackRate"
                >
                  <RotateCcw/>
                </Button>
              </div>

              <Slider
                :id="playerDomId('playbackSpeed')"
                v-model="playbackRate"
                size="sm"
                :min="0.5"
                :max="2"
                :step="0.05"
                class="cursor-pointer mt-1"
                aria-label="Playback rate"
              />

              <div class="text-foreground-muted flex justify-between text-xs tabular-nums font-mono">
                <span>0.5x</span>
                <span>1x</span>
                <span>1.5x</span>
                <span>2x</span>
              </div>
            </Field>
          </CardContent>
        </Card>
      </div>
    </SheetContent>
  </Sheet>
</template>
