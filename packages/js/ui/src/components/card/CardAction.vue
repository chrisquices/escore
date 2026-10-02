<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "strata-packages/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="card-action"
    :class="cn('col-start-2 row-start-1 self-center justify-self-end', props.class)"
  >
    <slot />
  </div>
</template>
