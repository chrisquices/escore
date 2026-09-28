<script setup lang="ts">
import type { CollapsibleContentProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import { CollapsibleContent } from "reka-ui"
import { cn } from "escore-packages/ui/utils"

const props = defineProps<CollapsibleContentProps & { class?: HTMLAttributes["class"] }>()

const delegatedProps = reactiveOmit(props, "class")
</script>

<template>
  <CollapsibleContent
    data-slot="collapsible-content"
    v-bind="delegatedProps"
    :class="cn('data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden', props.class)"
  >
    <slot />
  </CollapsibleContent>
</template>
