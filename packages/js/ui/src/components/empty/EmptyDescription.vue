<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "strata-packages/ui/utils"

defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <p
    data-slot="empty-description"
    :class="cn(
      'text-foreground-muted [&>a:hover]:text-primary text-sm [&>a]:underline [&>a]:underline-offset-4',
      $attrs.class ?? '',
    )"
  >
    <slot />
  </p>
</template>
