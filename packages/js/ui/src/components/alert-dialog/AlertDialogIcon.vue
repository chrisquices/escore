<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { Info } from "@lucide/vue"
import { cn } from "@workspace/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="alert-dialog-icon"
    :class="cn('flex justify-center mt-2', props.class)"
  >
    <slot>
      <Info class="size-6" />
    </slot>
  </div>
</template>
