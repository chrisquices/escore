<script setup lang="ts">
import type { EditableCancelTriggerProps } from "reka-ui"
import { EditableCancelTrigger, useForwardProps } from "reka-ui"

const props = defineProps<EditableCancelTriggerProps>()
const forwarded = useForwardProps(props)
</script>

<template>
  <EditableCancelTrigger
    data-slot="editable-cancel-trigger"
    v-bind="forwarded"
  >
    <slot>Cancel</slot>
  </EditableCancelTrigger>
</template>
