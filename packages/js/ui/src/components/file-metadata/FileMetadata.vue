<script setup lang="ts">
import type {HTMLAttributes} from "vue"
import {cn} from "strata-packages/ui/utils"

const props = defineProps<{
  metadata: Record<string, string | number>
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <div data-slot="file-metadata" :class="cn('w-full text-sm', props.class)">
    <dl class="grid grid-cols-2 gap-x-4 gap-y-2">
      <template v-for="(value, label) in props.metadata" :key="label">
        <dt class="min-w-0 break-words text-left text-foreground-muted whitespace-nowrap">{{ label }}</dt>
        <dd class="min-w-0 break-words text-right whitespace-nowrap">{{ value }}</dd>
      </template>
    </dl>
  </div>
</template>
