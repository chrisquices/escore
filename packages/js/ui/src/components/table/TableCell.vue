<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "strata-packages/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
  sorted?: boolean
}>()
</script>

<template>
  <td
    data-slot="table-cell"
    :class="
      cn(
        'py-4 px-6 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5',
        props.class,
        props.sorted && 'font-bold! text-accent!',
      )
    "
  >
    <slot />
  </td>
</template>
