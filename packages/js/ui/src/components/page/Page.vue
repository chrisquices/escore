<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@workspace/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div
    data-slot="page"
    :class="cn(props.class)"
  >
    <slot />
  </div>
</template>
