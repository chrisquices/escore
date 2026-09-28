import { cva, type VariantProps } from '@workspace/ui/utils';

export { default as Alert } from './Alert.vue';
export { default as AlertDescription } from './AlertDescription.vue';
export { default as AlertTitle } from './AlertTitle.vue';

export const alertVariants = cva(
  'relative w-full rounded-lg border p-6 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-2 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
  {
    variants: {
      variant: {
        primary: 'border tone-primary-soft *:data-[slot=alert-description]:text-current/90',
        secondary: 'border tone-secondary-soft *:data-[slot=alert-description]:text-current/90',
        success: 'border tone-success-soft *:data-[slot=alert-description]:text-current/90',
        info: 'border tone-info-soft *:data-[slot=alert-description]:text-current/90',
        warning: 'border tone-warning-soft *:data-[slot=alert-description]:text-current/90',
        destructive: 'border tone-destructive-soft *:data-[slot=alert-description]:text-current/90',
        link: 'bg-transparent border-transparent text-foreground [&>svg]:text-current *:data-[slot=alert-description]:text-foreground-muted'
      }
    },
    defaultVariants: {
      variant: 'primary'
    }
  }
);

export type AlertVariants = VariantProps<typeof alertVariants>
