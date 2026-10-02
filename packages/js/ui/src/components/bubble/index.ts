import {cva, type VariantProps} from "strata-packages/ui/utils"

export {default as Bubble} from "./Bubble.vue"
export {default as BubbleContent} from "./BubbleContent.vue"
export {default as BubbleGroup} from "./BubbleGroup.vue"
export {default as BubbleReactions} from "./BubbleReactions.vue"

export const bubbleVariants = cva(
    "gap-1 data-[align=end]:self-end max-w-[80%] data-[variant=ghost]:max-w-full group-data-[align=end]/message:self-end group/bubble relative flex w-fit min-w-0 flex-col",
    {
        variants: {
            variant: {
                primary: "*:data-[slot=bubble-content]:text-primary-foreground *:data-[slot=bubble-content]:border *:data-[slot=bubble-content]:tone-primary [&>[data-slot=bubble-content]:is(button,a):hover]:brightness-90",
                secondary: "*:data-[slot=bubble-content]:text-secondary-foreground *:data-[slot=bubble-content]:border *:data-[slot=bubble-content]:tone-secondary [&>[data-slot=bubble-content]:is(button,a):hover]:brightness-90",
                success: "*:data-[slot=bubble-content]:text-success-foreground *:data-[slot=bubble-content]:border *:data-[slot=bubble-content]:tone-success [&>[data-slot=bubble-content]:is(button,a):hover]:brightness-90",
                info: "*:data-[slot=bubble-content]:text-info-foreground *:data-[slot=bubble-content]:border *:data-[slot=bubble-content]:tone-info [&>[data-slot=bubble-content]:is(button,a):hover]:brightness-90",
                warning: "*:data-[slot=bubble-content]:text-warning-foreground *:data-[slot=bubble-content]:border *:data-[slot=bubble-content]:tone-warning [&>[data-slot=bubble-content]:is(button,a):hover]:brightness-90",
                destructive: "*:data-[slot=bubble-content]:text-destructive-foreground *:data-[slot=bubble-content]:border *:data-[slot=bubble-content]:tone-destructive [&>[data-slot=bubble-content]:is(button,a):hover]:brightness-90",
                link: "*:data-[slot=bubble-content]:bg-transparent *:data-[slot=bubble-content]:border-transparent *:data-[slot=bubble-content]:text-foreground *:data-[slot=bubble-content]:underline-offset-4 [&>[data-slot=bubble-content]:is(button,a):hover]:underline",
            }
        },
        defaultVariants: {
            variant: "primary",
        },
    },
)
export type BubbleVariants = VariantProps<typeof bubbleVariants>

export const bubbleReactionsVariants = cva(
    "rounded-full shadow-surface! ring-1 shrink-0 gap-1 px-1.5 py-0.5 has-[button]:p-0 text-sm absolute z-10 flex w-fit items-center justify-center",
    {
        variants: {
            variant: {
                primary: "text-primary-foreground ring-primary tone-primary",
                secondary: "text-secondary-foreground ring-secondary tone-secondary",
                accent: "text-accent-foreground ring-accent tone-accent",
                success: "text-success-foreground ring-success tone-success",
                info: "text-info-foreground ring-info tone-info",
                warning: "text-warning-foreground ring-warning tone-warning",
                destructive: "text-destructive-foreground ring-destructive tone-destructive",
            },
            side: {
                top: "top-0 -translate-y-3/4",
                bottom: "bottom-0 translate-y-3/4",
            },
            align: {
                start: "left-3",
                end: "right-3",
            },
        },
        defaultVariants: {
            variant: "primary",
            side: "bottom",
            align: "end",
        },
    },
)
export type BubbleReactionsVariants = VariantProps<typeof bubbleReactionsVariants>
