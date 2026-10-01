<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "escore-packages/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <li
    data-slot="sidebar-menu-item"
    data-sidebar="menu-item"
    :class="cn(
      'group/menu-item relative min-h-control-height flex items-center gap-1',
      'has-[>[data-slot=sidebar-menu-sub]]:flex-col has-[>[data-slot=sidebar-menu-sub]]:items-stretch',
      props.class,
    )"
  >
    <slot />
  </li>
</template>
