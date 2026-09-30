<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { computed, inject } from "vue"
import { cn } from "escore-packages/ui/utils"
import { inputOTPSlotsKey } from "./context"

const props = defineProps<{ index: number; class?: HTMLAttributes["class"] }>()

const slots = inject(inputOTPSlotsKey, undefined)

if (!slots) {
  throw new Error("InputOTPSlot must be used inside InputOTP.")
}

const slot = computed(() => {
  if (!Number.isInteger(props.index) || props.index < 0 || props.index >= slots.value.length) {
    throw new RangeError(`InputOTPSlot index must be a non-negative integer less than InputOTP maxlength (${slots.value.length}); received ${String(props.index)}.`)
  }

  return slots.value[props.index]!
})
</script>

<template>
  <div
    data-slot="input-otp-slot"
    :data-active="slot.isActive"
    :class="cn('data-[active=true]:border-ring data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:ring-destructive/20 aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive border-input-border relative flex h-control-height w-10 items-center justify-center border-y border-r text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md data-[active=true]:z-10 data-[active=true]:ring-3', props.class)"
  >
    {{ slot.char }}
    <div v-if="slot.hasFakeCaret" class="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div class="animate-caret-blink bg-foreground h-4 w-px duration-1000" />
    </div>
  </div>
</template>
