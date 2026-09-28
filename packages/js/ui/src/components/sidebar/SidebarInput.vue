<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@workspace/ui/utils"
import { Input } from '@workspace/ui/input'

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <Input
    data-slot="sidebar-input"
    data-sidebar="input"
    :class="cn(
      'bg-background h-control-height w-full shadow-none',
      props.class,
    )"
  >
    <slot />
  </Input>
</template>
