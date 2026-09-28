<script setup lang="ts">
import {computed} from 'vue';
import type {PropType} from 'vue';
import {TreeRoot} from 'reka-ui';
import TreeNode from './TreeNode.vue';

interface TreeItemData extends Record<string, unknown> {
  id: string;
  label: string;
  icon?: unknown;
  count?: number | string;
  defaultOpen?: boolean;
  children?: TreeItemData[];
}

interface TreeState {
  treeItemsById: Map<string, TreeItemData>;
  defaultExpandedIds: string[];
}

const props = defineProps({
  data: {
    type: Array as PropType<TreeItemData[]>,
    default: function () {
      return [];
    },
  },
  defaultExpandedIds: {
    type: Array as PropType<string[]>,
    default: undefined,
  },
});

const selectedId = defineModel<string | undefined>('selectedId');
const expandedIds = defineModel<string[] | undefined>('expandedIds');
const emit = defineEmits<{
  activate: [node: TreeItemData];
}>();

const treeState = computed(function () {
  const state: TreeState = {
    treeItemsById: new Map<string, TreeItemData>(),
    defaultExpandedIds: props.defaultExpandedIds ? props.defaultExpandedIds.slice() : [],
  };

  collectTreeState(props.data, 0, state, props.defaultExpandedIds === undefined);

  return state;
});

const selectedModel = computed<TreeItemData | undefined>({
  get: function () {
    if (selectedId.value == null) {
      return undefined;
    }

    return treeState.value.treeItemsById.get(selectedId.value);
  },
  set: function (treeItem: TreeItemData | undefined) {
    selectedId.value = treeItem?.id;
  },
});

function getKey(treeItem: TreeItemData) {
  return treeItem.id;
}

function getChildren(treeItem: TreeItemData) {
  if (treeItem.children && treeItem.children.length > 0) {
    return treeItem.children;
  }

  return undefined;
}

function collectTreeState(treeItems: TreeItemData[], depth: number, state: TreeState, includeDefaultExpandedIds: boolean) {
  for (const treeItem of treeItems) {
    const children = getChildren(treeItem);

    state.treeItemsById.set(treeItem.id, treeItem);

    if (children && includeDefaultExpandedIds && (treeItem.defaultOpen ?? depth === 0)) {
      state.defaultExpandedIds.push(treeItem.id);
    }

    if (children) {
      collectTreeState(children, depth + 1, state, includeDefaultExpandedIds);
    }
  }
}
</script>

<template>
  <TreeRoot
      v-slot="{ flattenItems }"
      v-model="selectedModel"
      v-model:expanded="expandedIds"
      :default-expanded="treeState.defaultExpandedIds"
      :items="data"
      :get-key="getKey"
      :get-children="getChildren"
      selection-behavior="replace"
  >
    <TransitionGroup name="strata-tree-row" tag="div" class="flex flex-col">
      <TreeNode
          v-for="item in flattenItems"
          :key="item._id"
          :item="item"
          @activate="emit('activate', $event)"
      />
    </TransitionGroup>
  </TreeRoot>
</template>

<style>
.strata-tree-row-enter-active,
.strata-tree-row-leave-active {
  max-height: 2rem;
  overflow: hidden;
  transition: max-height 200ms ease-out,
  opacity 200ms ease-out,
  transform 200ms ease-out;
}

.strata-tree-row-enter-from,
.strata-tree-row-leave-to {
  max-height: 0;
  opacity: 0;
  transform: translateY(-0.25rem);
}

.strata-tree-row-enter-to,
.strata-tree-row-leave-from {
  max-height: 2rem;
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .strata-tree-row-enter-active,
  .strata-tree-row-leave-active {
    transition: none;
  }
}
</style>
