<script setup lang="ts">
import type { EditableEditTriggerProps } from "reka-ui"
import { EditableEditTrigger, injectEditableRootContext, useForwardProps } from "reka-ui"

const props = defineProps<EditableEditTriggerProps>()
const forwarded = useForwardProps(props)
const context = injectEditableRootContext()
</script>

<template>
  <EditableEditTrigger
    data-slot="editable-edit-trigger"
    v-bind="forwarded"
    :disabled="context.disabled.value || context.readonly.value"
    :aria-disabled="context.disabled.value || context.readonly.value || undefined"
    :data-disabled="context.disabled.value || context.readonly.value ? '' : undefined"
  >
    <slot>Edit</slot>
  </EditableEditTrigger>
</template>
