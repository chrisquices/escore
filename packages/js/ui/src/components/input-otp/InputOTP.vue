<script setup lang="ts">
import type { HTMLAttributes, PropType } from "vue"
import type { OTPInputEmits, OTPInputProps, SlotProps } from "vue-input-otp"
import { reactiveOmit } from "@vueuse/core"
import { useForwardPropsEmits } from "reka-ui"
import { defineComponent, provide, toRef } from "vue"
import { OTPInput } from "vue-input-otp"
import { cn } from "escore-packages/ui/utils"
import { inputOTPSlotsKey } from "./context"

// Keep the library's scoped slot state reactive and available through layout wrappers.
const InputOTPProvider = defineComponent({
  name: "InputOTPProvider",
  props: {
    slots: { type: Array as PropType<SlotProps[]>, required: true },
  },
  setup(providerProps, { slots }) {
    provide(inputOTPSlotsKey, toRef(providerProps, "slots"))
    return () => slots.default?.()
  },
})

const props = defineProps<OTPInputProps & { class?: HTMLAttributes["class"] }>()

const emits = defineEmits<OTPInputEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <OTPInput
    v-slot="slotProps"
    v-bind="forwarded"
    :container-class="cn('flex items-center gap-2 has-disabled:opacity-50', props.class)"
    data-slot="input-otp"
    class="disabled:cursor-not-allowed"
  >
    <InputOTPProvider :slots="slotProps.slots">
      <slot v-bind="slotProps" />
    </InputOTPProvider>
  </OTPInput>
</template>
