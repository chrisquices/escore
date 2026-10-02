<script lang="ts" setup>
import type { DrawerDescriptionProps } from "vaul-vue"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { DrawerDescription } from "vaul-vue"
import { cn } from "strata-packages/ui/utils"

const props = defineProps<DrawerDescriptionProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")
</script>

<template>
  <DrawerDescription
    data-slot="drawer-description"
    v-bind="delegatedProps"
    :class="cn('text-foreground-muted text-sm', props.class)"
  >
    <slot />
  </DrawerDescription>
</template>
