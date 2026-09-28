<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@workspace/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <header
    data-slot="page-section-heading"
    :class="cn('flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:h-heading-height', props.class)"
  >
    <slot />
  </header>
</template>
