<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { useVModel } from "@vueuse/core"
import { computed, useAttrs } from "vue"
import { Tooltip, TooltipContent, TooltipTrigger } from "escore-packages/ui/tooltip"
import { cn } from "escore-packages/ui/utils"

const props = defineProps<{
  defaultValue?: string | number
  modelValue?: string | number
  class?: HTMLAttributes["class"]
  error?: string
}>()

const emits = defineEmits<{
  (e: "update:modelValue", payload: string | number): void
}>()

const modelValue = useVModel(props, "modelValue", emits, {
  passive: true,
  defaultValue: props.defaultValue,
})
const attrs = useAttrs()
const inputIsFile = computed(() => attrs.type === "file")
const inputClass = computed(() => cn(
  'file:text-foreground placeholder:text-foreground-muted selection:bg-primary selection:text-primary-foreground border-input-border h-control-height w-full min-w-0 rounded-md border bg-input px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-input file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
  'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3',
  'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
  props.class,
))
</script>

<template>
  <Tooltip v-if="props.error">
    <TooltipTrigger as-child>
      <input
        v-if="inputIsFile"
        v-bind="attrs"
        data-slot="input"
        aria-invalid="true"
        :class="inputClass"
      >
      <input
        v-else
        v-bind="attrs"
        v-model="modelValue"
        data-slot="input"
        aria-invalid="true"
        :class="inputClass"
      >
    </TooltipTrigger>

    <TooltipContent>
      {{ props.error }}
    </TooltipContent>
  </Tooltip>

  <input
    v-else-if="inputIsFile"
    v-bind="attrs"
    data-slot="input"
    :class="inputClass"
  >
  <input
    v-else
    v-bind="attrs"
    v-model="modelValue"
    data-slot="input"
    :class="inputClass"
  >
</template>
