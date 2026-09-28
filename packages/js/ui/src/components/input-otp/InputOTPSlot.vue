<script setup lang="ts">
import type { SlotProps } from "vue-input-otp"
import type { HTMLAttributes } from "vue"
import { cn } from "escore-packages/ui/utils"

const props = defineProps<SlotProps & { class?: HTMLAttributes["class"] }>()
</script>

<template>
  <div
    data-slot="input-otp-slot"
    :data-active="isActive"
    :class="cn('data-[active=true]:border-ring data-[active=true]:ring-ring/50 data-[active=true]:aria-invalid:ring-destructive/20 aria-invalid:border-destructive data-[active=true]:aria-invalid:border-destructive border-input-border relative flex h-control-height w-10 items-center justify-center border-y border-r text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md data-[active=true]:z-10 data-[active=true]:ring-3', props.class)"
  >
    {{ char }}
    <div v-if="hasFakeCaret" class="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div class="animate-caret-blink bg-foreground h-4 w-px duration-1000" />
    </div>
  </div>
</template>
