<script setup lang="ts">
import type { PrimitiveProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { Primitive } from "reka-ui"
import { computed, onBeforeUnmount, onMounted, onUpdated, ref, watch } from "vue"
import { cn } from "strata-packages/ui/utils"

interface Props extends PrimitiveProps {
  class?: HTMLAttributes["class"]
  endLength?: number
  optimize?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  as: "span",
  endLength: 8,
  optimize: false,
})

const element = ref<HTMLElement | { $el?: Element } | null>(null)
const source = ref<HTMLElement | null>(null)
const fullText = ref("")
const measuredText = ref("")

const safeEndLength = computed(function () {
  const length = Number.isFinite(props.endLength) ? Math.floor(props.endLength) : 0

  return Math.min(Math.max(length, 0), fullText.value.length)
})

const parts = computed(function () {
  if (safeEndLength.value >= fullText.value.length) {
    return { head: fullText.value, tail: "" }
  }

  return {
    head: fullText.value.slice(0, fullText.value.length - safeEndLength.value),
    tail: fullText.value.slice(fullText.value.length - safeEndLength.value),
  }
})

let context: CanvasRenderingContext2D | null = null
let resizeObserver: ResizeObserver | null = null

function widthOf(string: string, font: string) {
  if (!context) {
    context = document.createElement("canvas").getContext("2d")
  }

  if (!context) {
    return string.length
  }

  context.font = font
  return context.measureText(string).width
}

function getElement() {
  const current = element.value

  if (current instanceof HTMLElement) {
    return current
  }

  if (current?.$el instanceof HTMLElement) {
    return current.$el
  }

  return null
}

function recompute() {
  const target = getElement()

  if (!target) {
    return
  }

  const available = target.clientWidth
  const style = getComputedStyle(target)
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`

  if (safeEndLength.value >= fullText.value.length) {
    measuredText.value = fullText.value
    return
  }

  if (widthOf(fullText.value, font) <= available) {
    measuredText.value = fullText.value
    return
  }

  const tail = fullText.value.slice(fullText.value.length - safeEndLength.value)
  let low = 0
  let high = fullText.value.length - safeEndLength.value
  let best = 0

  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const candidate = `${fullText.value.slice(0, middle)}...${tail}`

    if (widthOf(candidate, font) <= available) {
      best = middle
      low = middle + 1
    } else {
      high = middle - 1
    }
  }

  measuredText.value = `${fullText.value.slice(0, best)}...${tail}`
}

function teardown() {
  resizeObserver?.disconnect()
  resizeObserver = null
}

function syncText() {
  const nextText = source.value?.textContent?.trim() || ""

  if (nextText === fullText.value) {
    return false
  }

  fullText.value = nextText
  return true
}

function connect() {
  teardown()

  const target = getElement()

  if (props.optimize || !target) {
    return
  }

  recompute()
  resizeObserver = new ResizeObserver(recompute)
  resizeObserver.observe(target)

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(recompute)
  }
}

function refresh() {
  syncText()
  measuredText.value = fullText.value
  connect()
}

onMounted(refresh)
onBeforeUnmount(teardown)
onUpdated(function () {
  if (syncText()) {
    recompute()
  }
})
watch(function () {
  return [props.endLength, props.optimize]
}, function () {
  measuredText.value = fullText.value
  connect()
})
</script>

<template>
  <Primitive
    ref="element"
    data-slot="truncate-middle"
    :as="as"
    :as-child="asChild"
    :title="fullText || undefined"
    :class="cn('inline-block min-w-0 w-full max-w-full overflow-hidden whitespace-nowrap align-bottom', props.class)"
  >
    <span ref="source" class="sr-only">
      <slot />
    </span>
    <span v-if="props.optimize" aria-hidden="true" class="flex min-w-0">
      <span class="min-w-0 truncate">{{ parts.head }}</span>
      <span class="flex-none whitespace-pre">{{ parts.tail }}</span>
    </span>
    <span v-else aria-hidden="true">{{ measuredText || fullText }}</span>
  </Primitive>
</template>
