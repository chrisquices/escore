<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "strata-packages/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <section
    data-slot="page-section"
    :class="cn('flex min-w-0 flex-col gap-4 sm:gap-6 mb-4 sm:mb-6', props.class)"
  >
    <slot />
  </section>
</template>
