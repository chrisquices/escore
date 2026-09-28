<script setup lang="ts">
import type { PrimitiveProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { Primitive } from "reka-ui"
import { cn } from "escore-packages/ui/utils"

const props = withDefaults(defineProps<PrimitiveProps & {
  class?: HTMLAttributes["class"]
}>(), {
  as: "h2",
})

const delegatedProps = reactiveOmit(props, "class")
</script>

<template>
  <Primitive
    data-slot="page-section-heading-title"
    v-bind="delegatedProps"
    :class="cn('text-lg sm:text-2xl leading-tight font-bold tracking-tight gap-4 flex h-heading-height items-center', props.class)"
  >
    <slot />
  </Primitive>
</template>
