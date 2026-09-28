<script setup lang="ts">
import type {HTMLAttributes} from "vue"
import type {GridItemLabelVariants} from "."
import {computed} from "vue"
import {cn} from "@workspace/ui/utils"
import {gridItemLabelVariants} from "."
import {TruncateMiddle} from "@workspace/ui/truncate-middle"

type GridItemLabelTruncate = boolean | "middle" | "end"

interface Props {
  class?: HTMLAttributes["class"]
  name?: string
  variant?: GridItemLabelVariants["variant"]
}

const props = withDefaults(defineProps<Props>(), {
  name: "",
  variant: "overlay",
})
</script>

<template>
  <div
    data-slot="grid-item-label"
    :data-variant="props.variant"
    :class="cn(gridItemLabelVariants({ variant: props.variant }), props.class)"
  >
    <slot>
      <TruncateMiddle class="w-full" optimize>{{ props.name }}</TruncateMiddle>
    </slot>
  </div>
</template>
