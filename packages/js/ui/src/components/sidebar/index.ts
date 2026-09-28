import type { HTMLAttributes } from "vue"
import type {VariantProps} from "@workspace/ui/utils"
import {cva} from "@workspace/ui/utils"

export interface SidebarProps {
  side?: "left" | "right"
  size?: "default" | "sm"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
  position?: "fixed" | "sticky"
  class?: HTMLAttributes["class"]
}

export { default as Sidebar } from "./Sidebar.vue"
export { default as SidebarContent } from "./SidebarContent.vue"
export { default as SidebarFooter } from "./SidebarFooter.vue"
export { default as SidebarGroup } from "./SidebarGroup.vue"
export { default as SidebarGroupAction } from "./SidebarGroupAction.vue"
export { default as SidebarGroupContent } from "./SidebarGroupContent.vue"
export { default as SidebarGroupLabel } from "./SidebarGroupLabel.vue"
export { default as SidebarHeader } from "./SidebarHeader.vue"
export { default as SidebarInput } from "./SidebarInput.vue"
export { default as SidebarInset } from "./SidebarInset.vue"
export { default as SidebarMenu } from "./SidebarMenu.vue"
export { default as SidebarMenuAction } from "./SidebarMenuAction.vue"
export { default as SidebarMenuBadge } from "./SidebarMenuBadge.vue"
export { default as SidebarMenuButton } from "./SidebarMenuButton.vue"
export { default as SidebarMenuItem } from "./SidebarMenuItem.vue"
export { default as SidebarMenuSkeleton } from "./SidebarMenuSkeleton.vue"
export { default as SidebarMenuSub } from "./SidebarMenuSub.vue"
export { default as SidebarMenuSubButton } from "./SidebarMenuSubButton.vue"
export { default as SidebarMenuSubItem } from "./SidebarMenuSubItem.vue"
export { default as SidebarProvider } from "./SidebarProvider.vue"
export { default as SidebarRail } from "./SidebarRail.vue"
export { default as SidebarSeparator } from "./SidebarSeparator.vue"
export { default as SidebarTrigger } from "./SidebarTrigger.vue"

export { useSidebar } from "./utils"

const sidebarMenuButtonBase = [
  "peer/menu-button relative mx-2 flex w-[calc(100%-1rem)] cursor-pointer select-none items-center gap-2.5 overflow-hidden rounded-sm pl-3 pr-3 text-left text-sm whitespace-nowrap",
  "outline-none transition-colors duration-200 motion-reduce:transition-none",
  "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sidebar-ring/40",
  "disabled:pointer-events-none disabled:opacity-50",
  "aria-disabled:pointer-events-none aria-disabled:opacity-50",
  "group-has-data-[sidebar=menu-action]/menu-item:pr-8",
  "group-data-[collapsible=icon]:h-[calc(var(--control-height)-0.25rem)]!",
  "group-data-[collapsible=icon]:w-[calc(100%-0.5rem)]!",
  "group-data-[collapsible=icon]:px-2.5!",
  "[&>span:last-child]:flex-1 [&>span:last-child]:truncate",
  "[&>svg]:size-4 [&>svg]:shrink-0",
]

const sidebarMenuButtonDefault = [
  "text-foreground-muted",
  "hover:bg-sidebar-accent/10 hover:text-foreground",
  "active:bg-sidebar-accent/18 active:text-foreground",
  "data-[active=true]:bg-sidebar-accent/15 hover:data-[active=true]:bg-sidebar-accent/20 data-[active=true]:font-medium data-[active=true]:text-foreground",
  // "data-[state=open]:bg-sidebar-accent/15 data-[state=open]:text-foreground",
]

export const sidebarMenuButtonVariants = cva(
  sidebarMenuButtonBase,
  {
    variants: {
      variant: {
        default: sidebarMenuButtonDefault,
        primary: "border tone-primary hover:brightness-90 active:brightness-90",
        secondary: "border tone-secondary hover:brightness-90 active:brightness-90",
        accent: "border tone-accent hover:brightness-90 active:brightness-90",
      },
      size: {
        icon: [
          "h-[calc(var(--control-height)-0.25rem)] mx-auto aspect-square w-auto shrink-0 justify-center px-0",
          "group-has-data-[sidebar=menu-action]/menu-item:pr-0",
          "group-data-[collapsible=icon]:w-auto! group-data-[collapsible=icon]:px-0!",
        ],
        sm: "h-[calc(var(--control-height-sm)-0.25rem)] text-xs",
        default: "h-[calc(var(--control-height)-0.25rem)]",
        lg: "h-[calc(var(--control-height-lg)-0.25rem)] text-base group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

export type SidebarMenuButtonVariants = VariantProps<typeof sidebarMenuButtonVariants>
