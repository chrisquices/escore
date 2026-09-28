import {cva, type VariantProps} from "@workspace/ui/utils"

export { default as Grid } from "./Grid.vue"
export { default as GridItem } from "./GridItem.vue"
export { default as GridItemContent } from "./GridItemContent.vue"
export { default as GridItemLabel } from "./GridItemLabel.vue"
export { default as GridItemOverlay } from "./GridItemOverlay.vue"

export const gridVariants = cva(
  "min-w-0",
  {
    variants: {
      gap: {
        sm: "gap-2",
        md: "gap-4",
        lg: "gap-6",
      },
      virtualized: {
        true: "relative",
        false: "grid",
      },
    },
    defaultVariants: {
      gap: "md",
      virtualized: false,
    },
  },
)

export type GridVariants = VariantProps<typeof gridVariants>

export const gridItemVariants = cva(
  "group/grid-item block w-full min-w-0 overflow-hidden rounded-lg border border-border bg-surface p-0 text-left text-foreground",
  {
    variants: {
      interactive: {
        true: "cursor-pointer transition-[border-color,box-shadow] duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        false: "",
      },
      selected: {
        true: "border-primary ring-2 ring-primary",
        false: "",
      },
      inert: {
        true: "cursor-not-allowed opacity-50",
        false: "",
      },
      virtualized: {
        true: "absolute left-0 top-0",
        false: "relative",
      },
    },
    defaultVariants: {
      interactive: false,
      selected: false,
      inert: false,
      virtualized: false,
    },
  },
)

export type GridItemVariants = VariantProps<typeof gridItemVariants>

export const gridItemContentVariants = cva(
  "relative w-full overflow-hidden bg-input",
  {
    variants: {
      aspect: {
        square: "aspect-square",
        portrait: "aspect-[3/4]",
        landscape: "aspect-[4/3]",
        wide: "aspect-video",
      },
    },
    defaultVariants: {
      aspect: "square",
    },
  },
)

export type GridItemContentVariants = VariantProps<typeof gridItemContentVariants>

export const gridItemLabelVariants = cva(
  "min-w-0 text-xs font-medium",
  {
    variants: {
      variant: {
        overlay: "pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-overlay/90 via-overlay/50 to-transparent px-3 pb-3 pt-10 text-white",
        below: "relative z-20 border-t border-border px-3 py-3 text-foreground",
      },
    },
    defaultVariants: {
      variant: "overlay",
    },
  },
)

export type GridItemLabelVariants = VariantProps<typeof gridItemLabelVariants>

export const gridItemOverlayVariants = cva(
  "absolute inset-0 z-10 group-hover/grid-item:bg-overlay/10 duration-100 transition-all",
  {
    variants: {
      variant: {
        transparent: "",
        scrim: "bg-overlay/25",
      },
      visibility: {
        always: "",
        hover: "opacity-0 transition-opacity duration-100 group-hover/grid-item:opacity-100 group-focus-within/grid-item:opacity-100",
      },
    },
    defaultVariants: {
      variant: "transparent",
      visibility: "always",
    },
  },
)

export type GridItemOverlayVariants = VariantProps<typeof gridItemOverlayVariants>
