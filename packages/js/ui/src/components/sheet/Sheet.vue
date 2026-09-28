<script setup lang="ts">
import type { DialogRootEmits, DialogRootProps } from "reka-ui"
import { reactiveOmit } from "@vueuse/core"
import { DialogRoot, useForwardPropsEmits } from "reka-ui"
import { provide, toRef } from "vue"
import { sheetPortalToKey } from "./context"

const props = defineProps<DialogRootProps & {
  portalTo?: string | HTMLElement | null
}>()
const emits = defineEmits<DialogRootEmits>()

provide(sheetPortalToKey, toRef(props, "portalTo"))

const delegatedProps = reactiveOmit(props, "portalTo")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogRoot
    v-slot="slotProps"
    data-slot="sheet"
    v-bind="forwarded"
  >
    <slot v-bind="slotProps" />
  </DialogRoot>
</template>
