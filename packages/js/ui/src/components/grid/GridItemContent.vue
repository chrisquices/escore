<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import type { GridItemContentVariants } from "."
import { cn } from "@workspace/ui/utils"
import { gridItemContentVariants } from "."

interface Props {
  class?: HTMLAttributes["class"]
  aspect?: GridItemContentVariants["aspect"]
}

const props = withDefaults(defineProps<Props>(), {
  aspect: "square",
})
</script>

<template>
  <div
      data-slot="grid-item-content"
      :class="cn(gridItemContentVariants({ aspect: props.aspect }), props.class)"
  >
    <slot />
  </div>
</template>
