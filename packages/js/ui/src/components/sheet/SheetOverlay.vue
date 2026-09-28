<script setup lang="ts">
import type { DialogOverlayProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { DialogOverlay } from "reka-ui"
import { computed, inject } from "vue"
import { cn } from "escore-packages/ui/utils"
import { sheetPortalToKey } from "./context"

const props = defineProps<DialogOverlayProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")
const inheritedPortalTo = inject(sheetPortalToKey, undefined)
const isLocalPortal = computed(() => Boolean(inheritedPortalTo?.value))
</script>

<template>
  <DialogOverlay
    data-slot="sheet-overlay"
    :class="cn(
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 inset-0 z-50 bg-overlay',
      isLocalPortal ? 'absolute' : 'fixed',
      props.class,
    )"
    v-bind="delegatedProps"
  >
    <slot />
  </DialogOverlay>
</template>
