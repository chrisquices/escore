<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "escore-packages/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <tr
    data-slot="table-row"
    :class="cn('hover:bg-surface-muted/50 data-[state=selected]:bg-surface-muted border-b border-border transition-colors', props.class)"
  >
    <slot />
  </tr>
</template>
