<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { captionVariants } from "strata-packages/ui/caption"
import { cn } from "strata-packages/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <legend
    data-slot="field-legend"
    :class="cn(captionVariants(), 'mb-3', props.class)"
  >
    <slot />
  </legend>
</template>
