<script setup lang="ts">
import type { ComboboxInputEmits, ComboboxInputProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { SearchIcon } from "@lucide/vue"
import { reactiveOmit } from "@vueuse/core"
import { ComboboxInput, useForwardPropsEmits } from "reka-ui"
import { cn } from "escore-packages/ui/utils"

defineOptions({
  inheritAttrs: false,
})

const props = defineProps<ComboboxInputProps & {
  class?: HTMLAttributes["class"]
}>()

const emits = defineEmits<ComboboxInputEmits>()

const delegatedProps = reactiveOmit(props, "class")

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <div
    data-slot="command-input-wrapper"
    class="flex h-control-height items-center gap-2 border-b border-border px-1.5"
  >
    <SearchIcon class="size-4 shrink-0 text-foreground-muted" />
    <ComboboxInput
      data-slot="command-input"
      :class="cn(
        'placeholder:text-foreground-muted flex h-control-height w-full rounded-md bg-transparent py-3 text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50',
        props.class,
      )"

      v-bind="{ ...$attrs, ...forwarded }"
    >
      <slot />
    </ComboboxInput>
  </div>
</template>
