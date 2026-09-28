<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "escore-packages/ui/utils"

const props = defineProps<{ class?: HTMLAttributes["class"] }>()
</script>

<template>
  <div
    data-slot="sheet-header"
    :class="cn('flex flex-col gap-1.5 px-4 border-b border-border py-4 items-start justify-center', props.class)"
  >
    <slot />
  </div>
</template>
