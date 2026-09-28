<script setup lang="ts">
import type { DialogRootEmits, DialogRootProps } from "reka-ui"
import type { Ref } from "vue"
import { reactiveOmit, useVModel } from "@vueuse/core"
import { DialogRoot, useForwardProps } from "reka-ui"
import { provide, toRef } from "vue"
import { dialogDismissibleKey, dialogProcessingKey } from "./context"

const props = withDefaults(defineProps<DialogRootProps & {
  dismissible?: boolean
  processing?: boolean
}>(), {
  dismissible: true,
  processing: false,
})
const emits = defineEmits<DialogRootEmits>()

const open = useVModel(props, "open", emits, {
  defaultValue: props.defaultOpen ?? false,
  passive: (props.open === undefined) as false,
}) as Ref<boolean>

provide(dialogDismissibleKey, toRef(props, "dismissible"))
provide(dialogProcessingKey, toRef(props, "processing"))

const delegatedProps = reactiveOmit(props, "open", "defaultOpen", "dismissible", "processing")
const forwardedProps = useForwardProps(delegatedProps)

function updateOpen(value: boolean) {
  if (!value && !props.dismissible) return

  open.value = value
}
</script>

<template>
  <DialogRoot
    v-slot="slotProps"
    :open="open"
    data-slot="dialog"
    v-bind="forwardedProps"
    @update:open="updateOpen"
  >
    <slot v-bind="slotProps" />
  </DialogRoot>
</template>
