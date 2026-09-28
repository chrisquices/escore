import {cva, type VariantProps} from "escore-packages/ui/utils"

export {default as Button} from "./Button.vue"

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 active:scale-95 active:brightness-90 whitespace-nowrap rounded-sm text-sm font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        primary: "border tone-primary hover:brightness-90",
        secondary: "border tone-secondary hover:brightness-90",
        accent: "border tone-accent hover:brightness-90",
        success: "border tone-success hover:brightness-90",
        info: "border tone-info hover:brightness-90",
        warning: "border tone-warning hover:brightness-90",
        destructive: "border tone-destructive hover:brightness-90",
        outline: "border tone-outline hover:bg-primary/5",
        input: "text-foreground border border-input-border bg-input shadow-xs font-normal justify-start",
        ghost: "text-foreground border hover:text-foreground bg-transparent border-transparent hover:bg-secondary",
        link: "text-foreground border hover:text-foreground bg-transparent border-transparent hover:underline",
      },
      size: {
        "xs": "h-control-height-xs rounded-[6px] gap-1.5 px-2 has-[>svg]:px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        "sm": "h-control-height-sm rounded-sm gap-1.5 px-3 has-[>svg]:px-3 text-xs [&_svg:not([class*='size-'])]:size-3",
        "default": "h-control-height rounded-sm px-3 py-2 has-[>svg]:px-3",
        "lg": "h-control-height-lg rounded-md px-4 has-[>svg]:px-4",
        "icon-xs": "size-control-height-xs [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-control-height-sm [&_svg:not([class*='size-'])]:size-3",
        "icon": "size-control-height",
        "icon-lg": "size-control-height-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
)

export type ButtonVariants = VariantProps<typeof buttonVariants>
