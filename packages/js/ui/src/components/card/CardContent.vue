<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@workspace/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="card-content"
    :class="cn('px-6 gap-6 grid grid-cols-1', props.class)"
  >
    <slot />
  </div>
</template>
