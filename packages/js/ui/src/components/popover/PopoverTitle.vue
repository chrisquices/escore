<script setup lang="ts">
import type { PrimitiveProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { Primitive } from "reka-ui"
import { cn } from "escore-packages/ui/utils"

const props = withDefaults(defineProps<PrimitiveProps & { class?: HTMLAttributes["class"] }>(), {
  as: "h3",
})

const delegatedProps = reactiveOmit(props, "class")
</script>

<template>
  <Primitive
    data-slot="popover-title"
    :class="cn('text-sm leading-none font-bold', props.class)"
    v-bind="delegatedProps"
  >
    <slot />
  </Primitive>
</template>
