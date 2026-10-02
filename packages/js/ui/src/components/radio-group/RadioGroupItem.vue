<script setup lang="ts">
import type {RadioGroupItemProps} from "reka-ui"
import type {HTMLAttributes} from "vue"
import {CircleIcon} from "@lucide/vue"
import {reactiveOmit} from "@vueuse/core"
import {
  RadioGroupIndicator,
  RadioGroupItem,
  useForwardProps,
} from "reka-ui"
import {cn} from "strata-packages/ui/utils"

const props = defineProps<RadioGroupItemProps & { id: string; class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwardedProps = useForwardProps(delegatedProps)
</script>

<template>
  <RadioGroupItem
      data-slot="radio-group-item"
      v-bind="forwardedProps"
      :class="
      cn(
        'border-input-border text-primary focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive aspect-square size-4 shrink-0 rounded-full border shadow-xs transition-[color,background-color,border-color,box-shadow] outline-none focus-visible:ring-3 not-data-disabled:cursor-pointer not-data-disabled:hover:border-primary/70 not-data-disabled:hover:bg-primary/10 not-data-disabled:hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:ring-2 data-[state=checked]:ring-primary/25 data-[state=checked]:ring-offset-2 data-[state=checked]:ring-offset-background',
        props.class,
      )
    "
  >
    <RadioGroupIndicator
        data-slot="radio-group-indicator"
        class="relative flex items-center justify-center"
    >
      <slot>
        <CircleIcon class="fill-primary absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2"/>
      </slot>
    </RadioGroupIndicator>
  </RadioGroupItem>
</template>
