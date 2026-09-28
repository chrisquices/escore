<script setup lang="ts">
import type {HTMLAttributes} from "vue"
import {
  AudioWaveform,
  Gauge,
  Music,
  Pause,
  Play,
  Repeat,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
} from "@lucide/vue"
import {computed, onBeforeUnmount, onMounted, ref, shallowRef, triggerRef, watch} from "vue"
import {createAudio, type AudioArtwork, type AudioConfig, type AudioError, type AudioSource} from "escore-packages/ui-interactions/audio"
import {cn} from "escore-packages/ui/utils"
import {Button} from "escore-packages/ui/button"
import {Slider} from "escore-packages/ui/slider"

const props = withDefaults(defineProps<{
  size?: "full" | "compact" | "square"
  title?: string
  artist?: string
  album?: string
  sources?: AudioSource[]
  artwork?: AudioArtwork[]
  config?: Partial<AudioConfig>
  class?: HTMLAttributes["class"]
}>(), {
  size: "full",
  sources: () => [],
  artwork: () => [],
  config: () => ({}),
})

const playerContainer = ref<HTMLElement | null>(null)
const audioElement = ref<HTMLAudioElement | null>(null)
const audioEngine = shallowRef<ReturnType<typeof createAudio> | null>(null)
const audioError = ref<AudioError | null>(null)

const mediaSession = computed(() => ({
  title: props.title || "",
  artist: props.artist || "",
  album: props.album || "",
  artwork: props.artwork,
}))

const artwork = computed(() => props.artwork[0] ?? null)

function createAudioEngine() {
  if (!audioElement.value || !playerContainer.value) return

  audioEngine.value?.destroy()

  audioEngine.value = createAudio(audioElement.value, {
    ...props.config,
    audioId: props.config.audioId ?? `music-player-${props.title}`,
    playerContainer: playerContainer.value,
    autoplay: props.config.autoplay ?? false,
    loop: props.config.loop ?? false,
    sources: props.config.sources ?? props.sources,
    keyboardShortcuts: props.config.keyboardShortcuts ?? true,
    keyboardSeekStep: props.config.keyboardSeekStep ?? 5,
    keyboardVolumeStep: props.config.keyboardVolumeStep ?? 0.05,
    mediaSession: props.config.mediaSession ?? mediaSession.value,
    pitchShift: props.config.pitchShift ?? true,
    watchProgress: props.config.watchProgress ?? true,
    watchProgressSaveInterval: props.config.watchProgressSaveInterval ?? 1000,
    persistSettings: props.config.persistSettings ?? true,
    onChange(state) {
      triggerRef(audioEngine)
      props.config.onChange?.(state)
    },
    onError(error: AudioError) {
      audioError.value = error
      props.config.onError?.(error)
    },
  })
}

onMounted(() => {
  createAudioEngine()
})

watch(
  () => props.sources,
  (sources) => {
    if (props.config.sources) return

    audioEngine.value?.setSources(sources)
  },
  {deep: true},
)

watch(
  mediaSession,
  (nextMediaSession) => {
    if (props.config.mediaSession) return

    audioEngine.value?.setMediaSession(nextMediaSession)
  },
  {deep: true},
)

watch(
  () => props.config,
  () => {
    createAudioEngine()
  },
  {deep: true},
)

onBeforeUnmount(() => {
  audioEngine.value?.pause()
  audioEngine.value?.destroy()
})

const state = computed(() => audioEngine.value?.getState() ?? null)
const isPlaying = computed(() => !!state.value?.playing)
const isMuted = computed(() => !!state.value?.muted)
const isLooping = computed(() => !!state.value?.loop)
const abLoopPhase = computed(() => state.value?.abLoopPhase ?? "idle")
const currentTimeFormatted = computed(() => state.value?.currentTimeFormatted ?? "0:00")
const duration = computed(() => state.value?.duration ?? 0)
const durationFormatted = computed(() => state.value?.durationFormatted ?? "0:00")

const progress = computed({
  get() {
    return [state.value?.currentTime ?? 0]
  },
  set(val) {
    audioEngine.value?.seek(val[0])
  },
})

const volume = computed({
  get() {
    return [state.value?.muted ? 0 : Math.round((state.value?.volume ?? 0.8) * 100)]
  },
  set(val) {
    audioEngine.value?.setVolume(val[0] / 100)
  },
})

const playbackRate = computed({
  get() {
    return [state.value?.playbackRate ?? 1]
  },
  set(val) {
    audioEngine.value?.setPlaybackRate(val[0])
  },
})

const pitch = computed({
  get() {
    return [state.value?.pitchShift?.semitones ?? 0]
  },
  set(val) {
    audioEngine.value?.setPitch(val[0])
  },
})

function togglePlayback() {
  audioEngine.value?.togglePlayback()
}

function toggleMuted() {
  audioEngine.value?.toggleMuted()
}

function toggleLoop() {
  audioEngine.value?.toggleLoop()
}

function seekBackward() {
  audioEngine.value?.seekBackward(10)
}

function seekForward() {
  audioEngine.value?.seekForward(10)
}

function cycleAB() {
  if (abLoopPhase.value === "idle")
    audioEngine.value?.setAbLoopStart()
  else if (abLoopPhase.value === "pending")
    audioEngine.value?.setAbLoopEnd()
  else
    audioEngine.value?.clearAbLoop()
}

const volumeIcon = computed(() => {
  if (isMuted.value || volume.value[0] === 0) {
    return VolumeX
  }

  return volume.value[0] < 50 ? Volume1 : Volume2
})
</script>

<template>
  <div ref="playerContainer" class="contents">
    <audio ref="audioElement" class="hidden" preload="metadata"/>

    <!-- Full Player -->
    <div
      v-if="size === 'full'"
      :class="cn('flex w-full flex-col overflow-hidden select-none space-y-3', props.class)"
    >
      <div class="flex items-center gap-2">

        <!-- Current Time -->
        <span class="flex-none text-sm text-foreground-muted tabular-nums w-8">{{ currentTimeFormatted }}</span>

        <!-- Seeker -->
        <Slider v-model="progress" :max="duration" :step="0.1" class="cursor-pointer" aria-label="Seek"/>

        <!-- Duration -->
        <span class="flex-none text-sm text-foreground-muted tabular-nums w-8 text-right">{{ durationFormatted }}</span>
      </div>

      <div class="flex flex-col items-center gap-4 text-center md:grid md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center lg:text-left">
        <div class="flex min-w-0 flex-col items-center gap-3 text-center sm:gap-4 sm:flex-row md:text-left lg:text-left">

          <!-- Artwork -->
          <div class="flex size-12 flex-none items-center justify-center overflow-hidden rounded-md bg-surface-muted sm:size-44">

            <!-- Artwork -->
            <img v-if="artwork" :src="artwork.src" :alt="title || 'Artwork'" class="size-full object-cover">

            <!-- Artwork Fallback -->
            <Music v-else class="size-4 text-foreground-muted sm:size-5"/>
          </div>

          <!-- Metadata -->
          <div class="flex min-w-0 flex-col items-center gap-0.5 text-center md:items-start md:text-left">

            <!-- Title -->
            <span class="truncate text-sm font-medium text-foreground">{{ title }}</span>

            <!-- Artist -->
            <span class="truncate text-sm text-foreground-muted">{{ artist }}</span>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-center gap-0.5 lg:justify-self-center">

          <!-- AB Loop -->
          <Button
            variant="ghost"
            size="icon"
            :class="cn('rounded-full text-sm', abLoopPhase !== 'idle' ? 'bg-primary/15 text-primary hover:bg-primary/15' : 'text-foreground')"
            :aria-label="abLoopPhase === 'idle' ? 'Set A-B loop start' : abLoopPhase === 'pending' ? 'Set A-B loop end' : 'Clear A-B loop'"
            :title="abLoopPhase === 'idle' ? 'Set A-B loop start' : abLoopPhase === 'pending' ? 'Set A-B loop end' : 'Clear A-B loop'"
            @click="cycleAB"
          >
            A·B
          </Button>

          <!-- Previous -->
          <Button variant="ghost" size="icon-lg" class="rounded-full" aria-label="Back 10 seconds" title="Back 10s" @click="seekBackward">
            <SkipBack class="size-4"/>
          </Button>

          <!-- Toggle Play/Pause -->
          <Button variant="primary" size="icon-lg" class="mx-1 rounded-full" :aria-label="isPlaying ? 'Pause' : 'Play'" @click="togglePlayback">
            <Pause v-if="isPlaying" class="size-4"/>
            <Play v-else class="size-4"/>
          </Button>

          <!-- Next -->
          <Button variant="ghost" size="icon-lg" class="rounded-full" aria-label="Forward 10 seconds" title="Forward 10s" @click="seekForward">
            <SkipForward class="size-4"/>
          </Button>

          <!-- Repeat -->
          <Button
            variant="ghost"
            size="icon"
            aria-label="Repeat"
            title="Repeat"
            :class="cn('rounded-full', isLooping ? 'bg-primary/15 text-primary hover:bg-primary/15' : 'text-foreground')"
            @click="toggleLoop"
          >
            <Repeat class="size-3.5"/>
          </Button>
        </div>

        <div class="grid w-full gap-1 grid-cols-1 lg:justify-self-end">

          <!-- Volume -->
          <div class="flex min-w-0 items-center justify-center gap-2 lg:justify-end">

            <!-- Toggle Mute -->
            <Button variant="ghost" size="icon" class="size-5 rounded-full text-foreground-muted" aria-label="Mute/Unmute" @click="toggleMuted">
              <component :is="volumeIcon" class="size-3.5"/>
            </Button>

            <!-- Volume Slider -->
            <Slider v-model="volume" size="sm" :max="100" :step="1" class="min-w-0 flex-1 sm:w-28 sm:flex-none" aria-label="Volume"/>

            <!-- Volume Label -->
            <span class="w-8 flex-none text-right text-sm font-medium text-foreground-muted tabular-nums">
              {{ isMuted ? 0 : volume[0] }}%
            </span>
          </div>

          <!-- Playback Rate -->
          <div class="flex min-w-0 items-center justify-center gap-2 lg:justify-end">

            <!-- Playback Rate Icon -->
            <span class="flex size-5 flex-none items-center justify-center text-foreground-muted" title="Playback rate">
              <Gauge class="size-3.5"/>
            </span>

            <!-- Playback Rate Slider -->
            <Slider v-model="playbackRate" size="sm" :min="0.5" :max="2" :step="0.05" class="min-w-0 flex-1 sm:w-28 sm:flex-none" aria-label="Playback rate"/>

            <!-- Playback Rate Label -->
            <span class="w-8 flex-none text-right text-sm font-medium text-foreground-muted tabular-nums">
              {{ playbackRate[0].toFixed(2).replace(/0$/, '') }}×
            </span>
          </div>

          <!-- Pitch -->
          <div class="flex min-w-0 items-center justify-center gap-2 lg:justify-end">

            <!-- Pitch Icon -->
            <span class="flex size-5 flex-none items-center justify-center text-foreground-muted" title="Pitch">
              <AudioWaveform class="size-3.5"/>
            </span>

            <!-- Pitch Slider -->
            <Slider v-model="pitch" size="sm" :min="-12" :max="12" :step="0.5" class="min-w-0 flex-1 sm:w-28 sm:flex-none" aria-label="Pitch"/>

            <!-- Pitch Label -->
            <span class="w-8 flex-none text-right text-sm font-medium text-foreground-muted tabular-nums">
              {{ pitch[0] > 0 ? '+' : '' }}{{ pitch[0] }}
            </span>
          </div>
        </div>
      </div>

      <!-- Error Message -->
      <p v-if="audioError" class="px-4 pb-3 text-sm text-destructive">{{ audioError.message }}</p>
    </div>

    <!-- Compact Player -->
    <div
      v-else-if="size === 'compact'"
      :class="cn('flex w-full flex-col overflow-hidden select-none', props.class)"
    >
      <div class="flex items-center gap-3">
        <div class="flex min-w-0 items-center gap-3">

          <!-- Artwork -->
          <div class="flex size-11 flex-none items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-secondary to-surface-muted shadow-raised">

            <!-- Artwork -->
            <img
              v-if="artwork"
              :src="artwork.src"
              :alt="title || 'Artwork'"
              class="size-full object-cover"
            >

            <!-- Artwork Fallback -->
            <Music v-else class="size-4 text-foreground-muted"/>
          </div>

          <!-- Metadata -->
          <div class="flex min-w-0 flex-col gap-0.5">

            <!-- Title -->
            <span class="truncate text-sm font-medium text-foreground">{{ title }}</span>

            <!-- Artist -->
            <span class="truncate text-sm text-foreground-muted">{{ artist }}</span>
          </div>
        </div>

        <div class="flex flex-none items-center gap-0.5">

          <!-- Previous -->
          <Button variant="ghost" size="icon" class="rounded-full" aria-label="Back 10 seconds" title="Back 10s" @click="seekBackward">
            <SkipBack class="size-3.5"/>
          </Button>

          <!-- Toggle Play/Pause -->
          <Button variant="primary" size="icon" class="mx-0.5 rounded-full" :aria-label="isPlaying ? 'Pause' : 'Play'" @click="togglePlayback">
            <Pause v-if="isPlaying" class="size-3.5"/>
            <Play v-else class="size-3.5"/>
          </Button>

          <!-- Next -->
          <Button variant="ghost" size="icon" class="rounded-full" aria-label="Forward 10 seconds" title="Forward 10s" @click="seekForward">
            <SkipForward class="size-3.5"/>
          </Button>
        </div>
      </div>

      <div class="mt-2 flex items-center gap-2">

        <!-- Current Time -->
        <span class="flex-none text-sm text-foreground-muted tabular-nums">{{ currentTimeFormatted }}</span>

        <!-- Seeker -->
        <Slider v-model="progress" size="sm" :max="duration" :step="0.1" class="cursor-pointer" aria-label="Seek"/>

        <!-- Duration -->
        <span class="flex-none text-sm text-foreground-muted tabular-nums">{{ durationFormatted }}</span>
      </div>

      <!-- Error Message -->
      <p v-if="audioError" class="pt-2 text-sm text-destructive">{{ audioError.message }}</p>
    </div>

    <!-- Square Player -->
    <div
      v-else
      :class="cn('flex aspect-square w-72 max-w-full flex-col justify-between overflow-hidden select-none', props.class)"
    >
      <div class="flex flex-none justify-center">

        <!-- Artwork -->
        <div class="flex size-18 flex-none items-center justify-center overflow-hidden rounded-md bg-gradient-to-br from-secondary to-surface-muted shadow-raised">

          <!-- Artwork -->
          <img
            v-if="artwork"
            :src="artwork.src"
            :alt="title || 'Artwork'"
            class="size-full object-cover"
          >

          <!-- Artwork Fallback -->
          <Music v-else class="size-6 text-foreground-muted"/>
        </div>
      </div>

      <!-- Metadata -->
      <div class="flex flex-none flex-col gap-0.5 text-center">

        <!-- Title -->
        <span class="truncate text-sm font-medium text-foreground">{{ title }}</span>

        <!-- Artist -->
        <span class="truncate text-sm text-foreground-muted">{{ artist }}</span>
      </div>

      <div class="flex flex-none items-center justify-center gap-0.5">

        <!-- AB Loop -->
        <Button
          variant="ghost"
          size="icon"
          :class="cn('rounded-full text-sm font-semibold', abLoopPhase !== 'idle' ? 'bg-primary/15 text-primary hover:bg-primary/15' : 'text-foreground')"
          :aria-label="abLoopPhase === 'idle' ? 'Set A-B loop start' : abLoopPhase === 'pending' ? 'Set A-B loop end' : 'Clear A-B loop'"
          :title="abLoopPhase === 'idle' ? 'Set A-B loop start' : abLoopPhase === 'pending' ? 'Set A-B loop end' : 'Clear A-B loop'"
          @click="cycleAB"
        >
          A·B
        </Button>

        <!-- Previous -->
        <Button variant="ghost" size="icon" class="rounded-full" aria-label="Back 10 seconds" title="Back 10s" @click="seekBackward">
          <SkipBack class="size-4"/>
        </Button>

        <!-- Toggle Play/Pause -->
        <Button variant="primary" size="icon" class="mx-1 rounded-full" :aria-label="isPlaying ? 'Pause' : 'Play'" @click="togglePlayback">
          <Pause v-if="isPlaying" class="size-4"/>
          <Play v-else class="size-4"/>
        </Button>

        <!-- Next -->
        <Button variant="ghost" size="icon" class="rounded-full" aria-label="Forward 10 seconds" title="Forward 10s" @click="seekForward">
          <SkipForward class="size-4"/>
        </Button>

        <!-- Repeat -->
        <Button
          variant="ghost"
          size="icon"
          aria-label="Repeat"
          title="Repeat"
          :class="cn('rounded-full', isLooping ? 'bg-primary/15 text-primary hover:bg-primary/15' : 'text-foreground')"
          @click="toggleLoop"
        >
          <Repeat class="size-3.5"/>
        </Button>
      </div>

      <div class="flex flex-none flex-col gap-0.5">

        <!-- Seek -->
        <div class="flex items-center gap-2">

          <!-- Current Time -->
          <span class="w-8 flex-none text-sm text-foreground-muted tabular-nums">{{ currentTimeFormatted }}</span>

          <!-- Seeker -->
          <Slider v-model="progress" size="sm" :max="duration" :step="0.1" class="cursor-pointer" aria-label="Seek"/>

          <!-- Duration -->
          <span class="w-8 flex-none text-right text-sm text-foreground-muted tabular-nums">{{ durationFormatted }}</span>
        </div>

        <!-- Volume -->
        <div class="flex items-center gap-2">

          <!-- Toggle Mute -->
          <Button variant="ghost" size="icon" class="size-5 w-8 flex-none justify-start rounded-full text-foreground-muted" aria-label="Mute/Unmute" @click="toggleMuted">
            <component :is="volumeIcon" class="size-3.5"/>
          </Button>

          <!-- Volume Slider -->
          <Slider v-model="volume" size="sm" :max="100" :step="1" aria-label="Volume"/>

          <!-- Volume Label -->
          <span class="w-8 flex-none text-right text-sm font-medium text-foreground-muted tabular-nums">{{ isMuted ? 0 : volume[0] }}%</span>
        </div>

        <!-- Playback Rate -->
        <div class="flex items-center gap-2">

          <!-- Playback Rate Icon -->
          <span class="flex w-8 flex-none items-center text-foreground-muted" title="Playback speed">
            <Gauge class="size-3.5"/>
          </span>

          <!-- Playback Rate Slider -->
          <Slider v-model="playbackRate" :min="0.5" size="sm" :max="2" :step="0.05" aria-label="Playback speed"/>

          <!-- Playback Rate Label -->
          <span class="w-8 flex-none text-right text-sm font-medium text-foreground-muted tabular-nums">
            {{ playbackRate[0].toFixed(2).replace(/0$/, '') }}×
          </span>
        </div>

        <!-- Pitch -->
        <div class="flex items-center gap-2">

          <!-- Pitch Icon -->
          <span class="flex w-8 flex-none items-center text-foreground-muted" title="Pitch">
            <AudioWaveform class="size-3.5"/>
          </span>

          <!-- Pitch Slider -->
          <Slider v-model="pitch" :min="-12" size="sm" :max="12" :step="0.5" aria-label="Pitch"/>

          <!-- Pitch Label -->
          <span class="w-8 flex-none text-right text-sm font-medium text-foreground-muted tabular-nums whitespace-nowrap">
            {{ pitch[0] > 0 ? '+' : '' }}{{ pitch[0] }}
          </span>
        </div>
      </div>

      <!-- Error Message -->
      <p v-if="audioError" class="text-sm text-destructive">{{ audioError.message }}</p>
    </div>
  </div>
</template>
