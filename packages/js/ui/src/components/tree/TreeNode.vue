<script setup lang="ts">
import {computed} from 'vue';
import {ChevronRight} from '@lucide/vue';
import {TreeItem} from 'reka-ui';
import type {FlattenedItem} from 'reka-ui';

defineOptions({name: 'TreeNode'});

interface TreeItemData extends Record<string, unknown> {
  id: string;
  label: string;
  icon?: unknown;
  count?: number | string;
  defaultOpen?: boolean;
  children?: TreeItemData[];
}

const props = defineProps<{
  item: FlattenedItem<TreeItemData>;
}>();
const emit = defineEmits<{ activate: [node: TreeItemData] }>();

const node = computed(function () {
  return props.item.value;
});
const paddingLeft = computed(function () {
  return `calc(var(--spacing) * 4 + ${(props.item.level - 1) * 1.25}rem)`;
});

function activateNode() {
  emit('activate', node.value);
}
</script>

<template>
  <TreeItem
      v-bind="item.bind"
      :style="{ paddingLeft }"
      class="group relative flex h-control-height cursor-pointer select-none items-center gap-2 pr-4 text-sm text-foreground-muted outline-none transition-colors hover:bg-sidebar-accent/20 hover:text-foreground active:bg-sidebar-accent/17 active:text-foreground data-[selected]:bg-sidebar-accent/15 hover:data-[selected]:bg-sidebar-accent/22 data-[selected]:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/30"
      @select="activateNode"
  >
    <span
        v-for="depthLineIndex in item.level - 1"
        :key="depthLineIndex"
        aria-hidden="true"
        class="absolute inset-y-0 w-px bg-border/60"
        :style="{ left: `${1.1875 + (depthLineIndex - 1) * 1.25}rem` }"
    ></span>

    <component :is="node.icon" v-if="node.icon"
               class="size-4 shrink-0"/>
    <span class="flex-1 truncate">{{ node.label }}</span>
    <span v-if="node.count !== undefined" class="shrink-0 text-xs text-foreground-subtle">{{ node.count }}</span>

    <ChevronRight
        v-if="item.hasChildren"
        aria-hidden="true"
        class="size-3.5 shrink-0 transition-transform duration-100 group-data-[expanded]:rotate-90"
    />

    <span class="absolute inset-y-0 right-0 w-0.5 bg-foreground opacity-0 group-data-[selected]:opacity-100"
          aria-hidden="true"></span>
  </TreeItem>
</template>
