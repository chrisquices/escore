<script setup lang="ts">
import type {ToggleVariants} from "strata-packages/ui/toggle"
import type {HTMLAttributes} from "vue"
import {Ellipsis} from "@lucide/vue"
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from "vue"
import {Button} from "strata-packages/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "strata-packages/ui/dropdown-menu"
import {ToggleGroup, ToggleGroupItem} from "strata-packages/ui/toggle-group"
import {cn} from "strata-packages/ui/utils"

interface OverflowGroupItem {
  value: string
  label: string
  disabled?: boolean
}

const props = withDefaults(defineProps<{
  modelValue: string
  items: readonly OverflowGroupItem[]
  label?: string
  moreLabel?: string
  variant?: ToggleVariants["variant"]
  size?: ToggleVariants["size"]
  class?: HTMLAttributes["class"]
}>(), {
  label: "Options",
  moreLabel: "More options",
  variant: "primary",
  size: "sm",
})

const emit = defineEmits<{
  "update:modelValue": [value: string]
}>()

const groupElement = ref<HTMLElement | null>(null)
const probeElement = ref<HTMLElement | null>(null)
const visibleCount = ref(props.items.length)
const isMeasured = ref(false)

const visibleItems = computed(function () {
  return props.items.slice(0, visibleCount.value)
})

const overflowItems = computed(function () {
  return props.items.slice(visibleCount.value)
})

const selectedItemIsOverflowed = computed(function () {
  return overflowItems.value.some(function (item) {
    return item.value === props.modelValue
  })
})

let resizeObserver: ResizeObserver | null = null
let measurementFrame: number | null = null

function setValue(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return

  emit("update:modelValue", value)
}

function scheduleMeasurement() {
  if (measurementFrame !== null) cancelAnimationFrame(measurementFrame)

  measurementFrame = requestAnimationFrame(measure)
}

function measure() {
  measurementFrame = null

  const availableWidth = groupElement.value?.clientWidth ?? 0
  const probe = probeElement.value
  if (availableWidth === 0 || !probe) return

  const probeItems = Array.from(probe.querySelectorAll<HTMLElement>("[data-overflow-group-probe-item]"))
  const probeItemsElement = probe.querySelector<HTMLElement>("[data-overflow-group-probe-items]")
  const probeMoreElement = probe.querySelector<HTMLElement>("[data-overflow-group-probe-more]")
  if (!probeItemsElement || !probeMoreElement) return

  const itemWidths = probeItems.map(function (item) {
    return item.getBoundingClientRect().width
  })
  const itemGap = probeItems.length > 1
      ? probeItems[1].getBoundingClientRect().left - probeItems[0].getBoundingClientRect().right
      : 0
  const moreGap = probeMoreElement.getBoundingClientRect().left - probeItemsElement.getBoundingClientRect().right
  const allItemsWidth = probeItemsElement.getBoundingClientRect().width

  if (allItemsWidth <= availableWidth) {
    visibleCount.value = props.items.length
    isMeasured.value = true
    return
  }

  const availableItemsWidth = availableWidth - probeMoreElement.getBoundingClientRect().width - moreGap
  let usedWidth = 0
  let nextVisibleCount = 0

  for (const itemWidth of itemWidths) {
    const nextWidth = usedWidth + (nextVisibleCount > 0 ? itemGap : 0) + itemWidth
    if (nextWidth > availableItemsWidth) break

    usedWidth = nextWidth
    nextVisibleCount++
  }

  visibleCount.value = nextVisibleCount
  isMeasured.value = true
}

watch(function () {
  return props.items
}, async function () {
  visibleCount.value = props.items.length
  await nextTick()
  scheduleMeasurement()
}, {deep: true})

onMounted(async function () {
  await nextTick()

  resizeObserver = new ResizeObserver(scheduleMeasurement)
  if (groupElement.value) resizeObserver.observe(groupElement.value)
  if (probeElement.value) resizeObserver.observe(probeElement.value)
  scheduleMeasurement()
})

onBeforeUnmount(function () {
  resizeObserver?.disconnect()
  if (measurementFrame !== null) cancelAnimationFrame(measurementFrame)
})
</script>

<template>
  <div
      ref="groupElement"
      data-slot="overflow-group"
      :class="cn(
        'relative flex min-h-control-height w-full min-w-0 items-center gap-1 overflow-hidden',
        !isMeasured && 'invisible',
        props.class,
      )"
  >
    <ToggleGroup
        v-if="visibleItems.length > 0"
        type="single"
        :model-value="modelValue"
        :variant="variant"
        :size="size"
        :spacing="1"
        :aria-label="label"
        class="max-w-full"
        @update:model-value="setValue"
    >
      <ToggleGroupItem
          v-for="item in visibleItems"
          :key="item.value"
          :value="item.value"
          :disabled="item.disabled"
      >
        {{ item.label }}
      </ToggleGroupItem>
    </ToggleGroup>

    <DropdownMenu v-if="overflowItems.length > 0">
      <DropdownMenuTrigger as-child>
        <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-label="moreLabel"
            :aria-pressed="selectedItemIsOverflowed"
            :class="selectedItemIsOverflowed && 'bg-accent text-accent-foreground'"
        >
          <Ellipsis/>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup :model-value="modelValue" @update:model-value="setValue">
          <DropdownMenuRadioItem
              v-for="item in overflowItems"
              :key="item.value"
              :value="item.value"
              :disabled="item.disabled"
          >
            {{ item.label }}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>

    <div
        ref="probeElement"
        inert
        aria-hidden="true"
        class="invisible fixed -left-[10000px] top-0 flex w-max items-center gap-1"
    >
      <div data-overflow-group-probe-items class="w-fit shrink-0">
        <ToggleGroup type="single" :variant="variant" :size="size" :spacing="1">
          <ToggleGroupItem
              v-for="item in items"
              :key="item.value"
              :value="item.value"
              data-overflow-group-probe-item
          >
            {{ item.label }}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <Button data-overflow-group-probe-more type="button" variant="ghost" size="icon-sm">
        <Ellipsis/>
      </Button>
    </div>
  </div>
</template>
