<script setup lang="ts">
import type { EditableRootEmits, EditableRootProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { EditableRoot, useForwardExpose, useForwardPropsEmits } from "reka-ui"
import { cn } from "@workspace/ui/utils"

const props = withDefaults(defineProps<EditableRootProps & { class?: HTMLAttributes["class"] }>(), {
  submitMode: "both",
})
const emits = defineEmits<EditableRootEmits>()

const delegatedProps = reactiveOmit(props, "class")
const forwarded = useForwardPropsEmits(delegatedProps, emits)
const { forwardRef } = useForwardExpose()
</script>

<template>
  <EditableRoot
    :ref="forwardRef"
    v-slot="slotProps"
    data-slot="editable"
    v-bind="forwarded"
    :activation-mode="props.disabled || props.readonly ? 'none' : props.activationMode"
    :class="cn('flex min-w-0 items-center gap-2', props.class)"
  >
    <slot v-bind="slotProps" />
  </EditableRoot>
</template>
