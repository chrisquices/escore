<script setup lang="ts">
import type {HTMLAttributes} from "vue"
import {cn} from "escore-packages/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <span
      data-slot="attachment-description"
      :class="cn(
      'mt-0.5 text-xs block min-w-0 truncate text-foreground-muted group-data-[state=error]/attachment:text-destructive/80',
      'max-w-full',
      props.class,
    )"
  >
    <slot/>
  </span>
</template>
