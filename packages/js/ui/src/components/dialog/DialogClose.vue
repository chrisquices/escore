<script setup lang="ts">
import type { DialogCloseProps } from "reka-ui"
import { DialogClose as RekaDialogClose } from "reka-ui"
import { inject, ref } from "vue"
import { dialogDismissibleKey } from "./context"

const props = defineProps<DialogCloseProps>()
const dismissible = inject(dialogDismissibleKey, ref(true))
</script>

<template>
  <RekaDialogClose
    data-slot="dialog-close"
    v-bind="props"
    :disabled="dismissible ? undefined : true"
    :aria-disabled="dismissible ? undefined : true"
  >
    <slot />
  </RekaDialogClose>
</template>
