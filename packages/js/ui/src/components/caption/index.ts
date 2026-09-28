import {cva, type VariantProps} from "@workspace/ui/utils"

export { default as Caption } from "./Caption.vue"

export const captionVariants = cva(
  "block text-[11px] font-medium uppercase tracking-[0.08em] flex items-center gap-1 [&_svg]:size-3.5",
  {
    variants: {
      variant: {
        subtle: "text-foreground-subtle",
        muted: "text-foreground-muted",
        foreground: "text-foreground",
        inherit: "text-inherit",
      },
    },
    defaultVariants: {
      variant: "subtle",
    },
  },
)

export type CaptionVariants = VariantProps<typeof captionVariants>
