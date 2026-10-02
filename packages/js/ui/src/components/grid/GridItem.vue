<script setup lang="ts">
import type { PrimitiveProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { Primitive } from "reka-ui"
import { computed, inject, useAttrs } from "vue"
import { cn } from "strata-packages/ui/utils"
import { gridItemVariants } from "."
import { gridVirtualizedKey } from "./context"

defineOptions({ inheritAttrs: false })

interface Props extends PrimitiveProps {
  class?: HTMLAttributes["class"]
  interactive?: boolean
  selected?: boolean
  disabled?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  interactive: false,
  selected: false,
  disabled: false,
  loading: false,
})

const attrs = useAttrs()
const gridVirtualized = inject(gridVirtualizedKey, undefined)

const inert = computed(function () {
  return props.disabled || props.loading
})

const resolvedAs = computed(function () {
  return props.as ?? (attrs.href != null ? "a" : props.interactive ? "button" : "div")
})

const virtualized = computed(function () {
  return gridVirtualized?.value ?? false
})

function suppressClickWhenInert(event: MouseEvent) {
  if (!inert.value) return

  event.preventDefault()
  event.stopImmediatePropagation()
}

function suppressKeysWhenInert(event: KeyboardEvent) {
  if (inert.value && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault()
  }
}
</script>

<template>
  <Primitive
      v-bind="$attrs"
      data-slot="grid-item"
      :as="resolvedAs"
      :href="resolvedAs === 'a' && inert ? undefined : attrs.href"
      :as-child="props.asChild"
      :type="!props.asChild && resolvedAs === 'button' ? 'button' : undefined"
      :disabled="!props.asChild && resolvedAs === 'button' && props.disabled ? true : undefined"
      :tabindex="!props.asChild && resolvedAs === 'a' && inert ? 0 : undefined"
      :aria-disabled="resolvedAs === 'button' ? (props.loading && !props.disabled ? 'true' : undefined) : inert ? 'true' : undefined"
      :aria-busy="props.loading || undefined"
      :data-interactive="props.interactive || undefined"
      :data-selected="props.selected || undefined"
      :data-disabled="props.disabled || undefined"
      :data-loading="props.loading || undefined"
      :class="cn(
      gridItemVariants({
        interactive: props.interactive,
        selected: props.selected,
        inert,
        virtualized,
      }),
      props.class,
    )"
      @click.capture="suppressClickWhenInert"
      @keydown.capture="suppressKeysWhenInert"
  >
    <slot />
  </Primitive>
</template>
