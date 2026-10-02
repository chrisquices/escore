<script setup lang="ts">
import type {AlertDialogActionProps} from "reka-ui"
import type {HTMLAttributes} from "vue"
import type {ButtonVariants} from 'strata-packages/ui/button'
import {reactiveOmit} from "@vueuse/core"
import {AlertDialogAction} from "reka-ui"
import {cn} from "strata-packages/ui/utils"
import {buttonVariants} from 'strata-packages/ui/button'

const props = defineProps<AlertDialogActionProps & {
  class?: HTMLAttributes["class"]
  variant?: ButtonVariants["variant"]
}>()

const delegatedProps = reactiveOmit(props, "class", "variant")

const emit = defineEmits<{
  click: [event: MouseEvent];
}>();
</script>

<template>
  <AlertDialogAction
    v-bind="delegatedProps"
    :data-variant="props.variant"
    :class="cn(buttonVariants({ variant: props.variant }), 'flex-1', props.class)"
    @click.capture="emit('click', $event)"
  >
    <slot/>
  </AlertDialogAction>
</template>
