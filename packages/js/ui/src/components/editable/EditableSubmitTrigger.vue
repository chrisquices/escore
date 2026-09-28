<script setup lang="ts">
import type { EditableSubmitTriggerProps } from "reka-ui"
import { EditableSubmitTrigger, useForwardProps } from "reka-ui"

const props = defineProps<EditableSubmitTriggerProps>()
const forwarded = useForwardProps(props)
</script>

<template>
  <EditableSubmitTrigger
    data-slot="editable-submit-trigger"
    v-bind="forwarded"
  >
    <slot>Save</slot>
  </EditableSubmitTrigger>
</template>
