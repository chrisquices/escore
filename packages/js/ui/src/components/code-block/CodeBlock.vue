<script setup lang="ts">
import { Check, Copy } from "@lucide/vue"
import { computed, ref } from "vue"
import { Button } from "strata-packages/ui/button"
import { Caption } from "strata-packages/ui/caption"

interface Props {
  code: string
  fileName?: string
  language?: string
}

const props = withDefaults(defineProps<Props>(), {
  fileName: "theme.css",
  language: "css",
})

const copied = ref(false)

const lines = computed(() => props.code.split("\n"))

async function copyCode() {
  await navigator.clipboard.writeText(props.code)
  copied.value = true
  window.setTimeout(() => {
    copied.value = false
  }, 1500)
}
</script>

<template>
  <div class="overflow-hidden rounded-xl border border-border bg-surface text-surface-foreground shadow-sm">
    <div class="flex items-center justify-between border-b border-border px-4 py-3">
      <div class="flex min-w-0 items-center gap-2">
        <span class="truncate text-sm font-medium">{{ fileName }}</span>
        <Caption variant="muted" class="rounded-md border border-border bg-surface-muted px-2 py-0.5">
          {{ language }}
        </Caption>
      </div>

      <Button variant="secondary" size="icon-sm" aria-label="Copy code" @click="copyCode">
        <Check v-if="copied" />
        <Copy v-else />
      </Button>
    </div>

    <div class="overflow-x-auto">
      <pre class="min-w-full py-4 pr-4 text-sm leading-6"><code class="block font-mono"><span
        v-for="(line, index) in lines"
        :key="index"
        class="grid grid-cols-[2rem_1fr] gap-4"
      ><span class="select-none text-right text-foreground-subtle">{{ index + 1 }}</span><span class="whitespace-pre">{{ line || ' ' }}</span></span></code></pre>
    </div>
  </div>
</template>
