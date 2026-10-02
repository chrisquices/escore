<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "strata-packages/ui/utils"
import { Input } from 'strata-packages/ui/input'

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <Input
    data-slot="input-group-control"
    :class="cn(
      'h-full flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0',
      props.class,
    )"
  />
</template>
