<script setup lang="ts">
import { computed } from "vue"
import { cn } from "@workspace/ui/utils"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@workspace/ui/sheet'
import { useSidebar } from "./utils"
import type { SidebarProps } from "."

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<SidebarProps>(), {
  side: "left",
  size: "default",
  variant: "sidebar",
  collapsible: "offcanvas",
  position: "fixed",
})

const sidebarStyle = computed(() => ({
  "--sidebar-instance-width": props.size === "sm"
    ? "var(--sidebar-width-sm)"
    : "var(--sidebar-width)",
}))

const { isMobile, state, openMobile, setOpenMobile } = useSidebar(props.collapsible === "none" ? null : undefined) ?? {}
</script>

<template>
  <div
    v-if="collapsible === 'none'"
    data-slot="sidebar"
    :style="sidebarStyle"
    :class="cn('bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-instance-width) flex-col', props.class)"
    v-bind="$attrs"
  >
    <slot />
  </div>

  <Sheet v-else-if="isMobile" :open="openMobile" v-bind="$attrs" @update:open="setOpenMobile">
    <SheetContent
      data-sidebar="sidebar"
      data-slot="sidebar"
      data-mobile="true"
      :side="side"
      :style="sidebarStyle"
      class="border-sidebar-border bg-sidebar text-sidebar-foreground w-(--sidebar-instance-width) p-0 [&>button]:hidden"
    >
      <SheetHeader class="sr-only">
        <SheetTitle>Sidebar</SheetTitle>
        <SheetDescription>Displays the mobile sidebar.</SheetDescription>
      </SheetHeader>
      <div class="flex h-full w-full flex-col">
        <slot />
      </div>
    </SheetContent>
  </Sheet>

  <div
    v-else
    class="group peer text-sidebar-foreground hidden md:block"
    data-slot="sidebar"
    :data-state="state"
    :data-collapsible="state === 'collapsed' ? collapsible : ''"
    :data-variant="variant"
    :data-side="side"
    :style="sidebarStyle"
  >

    <!-- Fixed sidebars need a gap because they sit outside normal document flow. -->
    <div
      v-if="position === 'fixed'"
      :class="cn(
        'relative w-(--sidebar-instance-width) bg-transparent transition-[width] duration-200 ease-linear',
        'group-data-[collapsible=offcanvas]:w-0',
        'group-data-[side=right]:rotate-180',
        variant === 'floating' || variant === 'inset'
          ? 'group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-compact)+(--spacing(4)))]'
          : 'group-data-[collapsible=icon]:w-sidebar-width-compact',
      )"
    />
    <div
      :class="cn(
        'z-10 hidden h-svh w-(--sidebar-instance-width) shrink-0 transition-[left,right,width] duration-200 ease-linear md:flex',
        position === 'fixed'
          ? 'fixed inset-y-0'
          : 'sticky top-0 group-data-[collapsible=offcanvas]:w-0 group-data-[collapsible=offcanvas]:overflow-hidden',
        position === 'fixed' && side === 'left'
          ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-instance-width)*-1)]'
          : position === 'fixed'
            ? 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-instance-width)*-1)]'
            : '',
        // Adjust the padding for floating and inset variants.
        variant === 'floating' || variant === 'inset'
          ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-compact)+(--spacing(4))+2px)]'
          : 'border-sidebar-border group-data-[collapsible=icon]:w-sidebar-width-compact group-data-[side=left]:border-r group-data-[side=right]:border-l',
        props.class,
      )"
      v-bind="$attrs"
    >
      <div
        data-sidebar="sidebar"
        class="bg-sidebar group-data-[variant=floating]:border-sidebar-border flex h-full w-full flex-col group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:shadow-sm"
      >
        <slot />
      </div>
    </div>
  </div>
</template>
