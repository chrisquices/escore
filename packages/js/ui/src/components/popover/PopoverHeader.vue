<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "escore-packages/ui/utils"

const props = defineProps<{ class?: HTMLAttributes["class"] }>()
</script>

<template>
  <div
    data-slot="popover-header"
    :class="cn('grid items-center has-data-[slot=popover-action]:grid-cols-[1fr_auto]', props.class)"
  >
    <slot />
  </div>
</template>
