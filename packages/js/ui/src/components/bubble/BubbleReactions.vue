<script lang='ts' setup>
import type { PrimitiveProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import type { BubbleReactionsVariants } from "."
import { Primitive } from "reka-ui"
import { cn } from "@workspace/ui/utils"
import { bubbleReactionsVariants } from "."

interface Props extends PrimitiveProps {
  variant?: BubbleReactionsVariants["variant"]
  side?: BubbleReactionsVariants["side"]
  align?: BubbleReactionsVariants["align"]
  class?: HTMLAttributes["class"]
}

const props = withDefaults(defineProps<Props>(), {
  variant: "primary",
  side: "bottom",
  align: "end",
  as: "div",
})
</script>

<template>
  <Primitive
    data-slot="bubble-reactions"
    :data-variant="variant"
    :data-side="side"
    :data-align="align"
    :as="as"
    :as-child="asChild"
    :class="cn(bubbleReactionsVariants({ variant, side, align }), props.class)"
  >
    <slot />
  </Primitive>
</template>
