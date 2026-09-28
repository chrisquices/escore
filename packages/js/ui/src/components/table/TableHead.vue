<script setup lang="ts">
import type {HTMLAttributes} from "vue"
import {ArrowUpDown} from "@lucide/vue"
import {cn} from "@workspace/ui/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
  sortable?: boolean,
  sorted?: boolean
}>()
</script>

<template>
  <th
    data-slot="table-head"
    :class="cn(
    'text-foreground-subtle uppercase text-2xs font-bold py-4 px-6 text-left align-middle tracking-widest whitespace-nowrap [&:has([role=checkbox])]:pr-0 *:[[role=checkbox]]:translate-y-0.5',
    props.sortable && 'cursor-pointer select-none transition-colors hover:text-accent/80',
    props.sorted && 'text-accent',
    props.class,
  )"
  >
    <span v-if="props.sortable" class="inline-flex items-center gap-1.5">
      <slot/>
      <ArrowUpDown
        :class="cn(
          'size-3.5 opacity-50',
          props.sorted && 'opacity-100',
        )"
      />
    </span>

    <slot v-else/>
  </th>
</template>
