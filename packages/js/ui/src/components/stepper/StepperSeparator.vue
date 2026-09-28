<script lang="ts" setup>
import type { StepperSeparatorProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { StepperSeparator, useForwardProps } from "reka-ui"
import { cn } from "escore-packages/ui/utils"

const props = defineProps<StepperSeparatorProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <StepperSeparator
    v-bind="forwarded"
    :class="cn(
      'bg-surface-muted data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
      // Disabled
      'group-data-[disabled]:bg-surface-muted group-data-[disabled]:opacity-50',
      // Completed
      'group-data-[state=completed]:bg-accent',
      props.class,
    )"
  />
</template>
