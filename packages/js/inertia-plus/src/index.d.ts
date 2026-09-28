import { type InertiaForm, router } from '@inertiajs/vue3';
import type { UnwrapNestedRefs } from 'vue';

type ReloadOptions = Parameters<typeof router.reload>[0];

export type InertiaPlusToastResponse = {
    props: {
        flash?: {
            success?: string;
            error?: string;
        };
    };
};

export type InertiaPlusFormOptions = {
    openable?: boolean;
    minimumLoading: boolean;
    minimumLoadingDuration?: number;
};

export type OpenableInertiaPlusForm<TData extends object> = {
    isOpen: boolean;
    show(values?: Partial<TData>): void;
    hide(): void;
    setOpen(open: boolean): void;
};

type FormData<T extends object> = {
    [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: T[K];
};

type FormMethods<T extends object> = {
    [K in keyof T as T[K] extends (...args: never[]) => unknown ? K : never]: T[K];
};

type WithOpenable<TOptions extends InertiaPlusFormOptions, TData extends object> = TOptions extends { openable: true }
    ? OpenableInertiaPlusForm<TData>
    : object;

export type InertiaPlusForm<TOptions extends InertiaPlusFormOptions, TDefinition extends object> = UnwrapNestedRefs<
    Omit<InertiaForm<FormData<TDefinition>>, keyof FormMethods<TDefinition>> &
    FormMethods<TDefinition> &
    WithOpenable<TOptions, FormData<TDefinition>>
>;

export type InertiaPlus<T extends object> = UnwrapNestedRefs<
    T & {
        reload(options?: ReloadOptions): void;
    }
>;

export declare function useInertiaPlus<T extends object>(definition: T & ThisType<InertiaPlus<T>>): InertiaPlus<T>;

export declare function toastFlashMessages(response: InertiaPlusToastResponse): void;

export declare function toastFirstValidationError(errors: Record<string, string>): void;

export declare function useInertiaPlusForm<TOptions extends InertiaPlusFormOptions, TDefinition extends object>(
    options: TOptions,
    definition: TDefinition & ThisType<InertiaPlusForm<TOptions, TDefinition>>,
): InertiaPlusForm<TOptions, TDefinition>;
