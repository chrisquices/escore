<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "escore-packages/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <form
    data-slot="form"
    :class="cn('grid grid-cols-1 gap-6', props.class)"
  >
    <slot />
  </form>
</template>
