<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { Caption } from "escore-packages/ui/caption"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <Caption
    data-slot="command-shortcut"
    variant="subtle"
    class="ml-auto normal-case"
    :class="props.class"
  >
    <slot />
  </Caption>
</template>
