import { cva, type VariantProps } from 'strata-packages/ui/utils';

export { default as Badge } from './Badge.vue';

export const badgeVariants = cva(
  'inline-flex items-center justify-center rounded-full border font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
  {
    variants: {
      variant: {
        primary: 'border tone-primary [a&]:hover:brightness-90',
        secondary: 'border tone-secondary [a&]:hover:brightness-90',
        accent: 'border tone-accent [a&]:hover:brightness-90',
        success: 'border tone-success [a&]:hover:brightness-90',
        info: 'border tone-info [a&]:hover:brightness-90',
        warning: 'border tone-warning [a&]:hover:brightness-90',
        destructive: 'border tone-destructive [a&]:hover:brightness-90',
        ghost: "border-transparent bg-transparent text-foreground [a&]:hover:bg-secondary [a&]:hover:text-foreground",
        link: 'bg-transparent border-transparent text-foreground [a&]:hover:text-foreground [a&]:hover:underline'
      },
      size: {
        'xs': 'gap-1 px-1.5 py-0 text-2xs [&>svg]:size-2',
        'sm': 'gap-1 px-1.5 py-0 text-xs [&>svg]:size-2.5',
        'default': 'gap-1 px-2 py-0.5 text-xs [&>svg]:size-3',
        'lg': 'gap-1.5 px-2.5 py-1 text-sm [&>svg]:size-3.5',
        'icon-xs': 'size-4 p-0 text-2xs [&>svg]:size-2 rounded-[4px]',
        'icon-sm': 'size-5 p-0 text-xs [&>svg]:size-2.5 rounded-xs',
        'icon': 'size-6 p-0 text-xs [&>svg]:size-3 rounded-xs',
        'icon-lg': 'size-8 p-0 text-sm [&>svg]:size-3.5'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default'
    }
  }
);

export type BadgeVariants = VariantProps<typeof badgeVariants>
