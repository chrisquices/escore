<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { Caption } from "@workspace/ui/caption"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <Caption
    data-slot="menubar-shortcut"
    variant="muted"
    class="ml-auto normal-case text-xs"
    :class="props.class"
  >
    <slot />
  </Caption>
</template>
