<script setup lang="ts">
import type { EditableAreaProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { EditableArea, useForwardProps } from "reka-ui"
import { cn } from "@workspace/ui/utils"

const props = defineProps<EditableAreaProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")
const forwarded = useForwardProps(delegatedProps)
</script>

<template>
  <EditableArea
    data-slot="editable-area"
    v-bind="forwarded"
    :class="cn('relative min-w-0 flex-1 data-[disabled]:opacity-50', props.class)"
  >
    <slot />
  </EditableArea>
</template>
