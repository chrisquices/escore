<script setup lang="ts">
import type { PrimitiveProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import type { GridVariants } from "."
import { Primitive } from "reka-ui"
import { computed, provide, toRef } from "vue"
import { cn } from "strata-packages/ui/utils"
import { gridVariants } from "."
import { gridVirtualizedKey } from "./context"

export type GridItemSize = "sm" | "md" | "lg" | `${number}rem`

interface Props extends PrimitiveProps {
  class?: HTMLAttributes["class"]
  virtualized?: boolean
  itemSize?: GridItemSize
  gap?: GridVariants["gap"]
}

const props = withDefaults(defineProps<Props>(), {
  as: "div",
  virtualized: false,
  itemSize: "md",
  gap: "md",
})

const gridItemSizePresets: Record<"sm" | "md" | "lg", string> = {
  sm: "8rem",
  md: "12rem",
  lg: "16rem",
}

const resolvedItemSize = computed(function () {
  return props.itemSize in gridItemSizePresets
    ? gridItemSizePresets[props.itemSize as keyof typeof gridItemSizePresets]
    : props.itemSize
})

const layoutStyle = computed(function () {
  return props.virtualized
    ? undefined
    : { gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${resolvedItemSize.value}), 1fr))` }
})

provide(gridVirtualizedKey, toRef(props, "virtualized"))
</script>

<template>
  <Primitive
      data-slot="grid"
      :data-virtualized="props.virtualized || undefined"
      :as="props.as"
      :as-child="props.asChild"
      :class="cn(gridVariants({ gap: props.gap, virtualized: props.virtualized }), props.class)"
      :style="layoutStyle"
  >
    <slot />
  </Primitive>
</template>
