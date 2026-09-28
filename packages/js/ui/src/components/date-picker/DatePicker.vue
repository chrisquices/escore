<script setup lang="ts">
import type { DateValue } from "@internationalized/date"
import type { HTMLAttributes } from "vue"
import { getLocalTimeZone, today } from "@internationalized/date"
import { CalendarDays } from "@lucide/vue"
import { useDateFormatter } from "reka-ui"
import { computed } from "vue"
import { cn } from "@workspace/ui/utils"
import { Button } from "@workspace/ui/button"
import { Calendar } from "@workspace/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/popover"

const props = withDefaults(defineProps<{
  modelValue?: DateValue
  placeholder?: string
  disabled?: boolean
  minValue?: DateValue
  maxValue?: DateValue
  align?: "start" | "center" | "end"
  class?: HTMLAttributes["class"]
}>(), {
  placeholder: "Pick a date",
  align: "start",
})

const emits = defineEmits<{
  "update:modelValue": [value: DateValue | undefined]
}>()

const formatter = useDateFormatter("en")

const label = computed(() => props.modelValue ? formatter.selectedDate(props.modelValue, false) : props.placeholder)
</script>

<template>
  <Popover v-slot="{ close }">
    <PopoverTrigger as-child>
      <Button
        variant="input"
        :disabled="disabled"
        :class="cn(
          'w-60',
          !modelValue && 'text-foreground-muted',
          props.class,
        )"
      >
        <CalendarDays />
        {{ label }}
      </Button>
    </PopoverTrigger>
    <PopoverContent class="w-auto p-0" :align="align">
      <Calendar
        :model-value="modelValue"
        :default-placeholder="modelValue ?? today(getLocalTimeZone())"
        :min-value="minValue"
        :max-value="maxValue"
        initial-focus
        @update:model-value="(value) => { emits('update:modelValue', value); close() }"
      />
    </PopoverContent>
  </Popover>
</template>
