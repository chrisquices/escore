<script setup lang="ts">
import type { AlertDialogCancelProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import type { ButtonVariants } from 'escore-packages/ui/button'
import { reactiveOmit } from "@vueuse/core"
import { AlertDialogCancel } from "reka-ui"
import { cn } from "escore-packages/ui/utils"
import { buttonVariants } from 'escore-packages/ui/button'

const props = withDefaults(defineProps<AlertDialogCancelProps & {
  class?: HTMLAttributes["class"]
  variant?: ButtonVariants["variant"]
}>(), {
  variant: 'secondary',
})

const delegatedProps = reactiveOmit(props, "class", "variant")
</script>

<template>
  <AlertDialogCancel
    v-bind="delegatedProps"
    :data-variant="props.variant"
    :class="cn(
      buttonVariants({ variant: props.variant }),
      'mt-2 sm:mt-0 flex-1',
      props.class,
    )"
  >
    <slot />
  </AlertDialogCancel>
</template>
