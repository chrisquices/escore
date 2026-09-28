<script setup lang="ts">
import type { PrimitiveProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import type { ButtonVariants } from "."
import { Primitive } from "reka-ui"
import { Spinner } from "@workspace/ui/spinner"
import { cn } from "@workspace/ui/utils"
import { buttonVariants } from "."

interface Props extends PrimitiveProps {
  variant?: ButtonVariants["variant"]
  size?: ButtonVariants["size"]
  disabled?: boolean
  loading?: boolean
  class?: HTMLAttributes["class"]
}

const props = withDefaults(defineProps<Props>(), {
  as: "button",
})
</script>

<template>
  <Primitive
    data-slot="button"
    :data-variant="variant"
    :data-size="size"
    :data-loading="loading || undefined"
    :as="as"
    :as-child="asChild"
    :disabled="loading || disabled ? true : undefined"
    :class="cn(buttonVariants({ variant, size }), loading && !asChild && 'relative', props.class)"
  >
    <template v-if="loading && !asChild">
      <Spinner class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      <span class="inline-flex items-center justify-center gap-1.5 opacity-0">
        <slot />
      </span>
    </template>
    <slot v-else />
  </Primitive>
</template>
