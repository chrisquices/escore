<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "escore-packages/ui/utils"

const props = defineProps<{ class?: HTMLAttributes["class"] }>()
</script>

<template>
  <div
    data-slot="popover-action"
    :class="cn('col-start-2 row-start-1 row-span-2 self-center justify-self-end text-sm leading-none font-bold text-foreground-muted', props.class)"
  >
    <slot />
  </div>
</template>
