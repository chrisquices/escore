<script setup lang="ts">
import type { EditableInputProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { EditableInput, useForwardProps } from "reka-ui"
import { cn } from "strata-packages/ui/utils"

const props = defineProps<EditableInputProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <EditableInput
    data-slot="editable-input"
    v-bind="forwarded"
    :class="cn(
      'placeholder:text-foreground-muted selection:bg-primary selection:text-primary-foreground border-input-border h-control-height w-full min-w-0 rounded-md border bg-input px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed md:text-sm',
      'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
      'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
      props.class,
    )"
  >
    <slot />
  </EditableInput>
</template>
