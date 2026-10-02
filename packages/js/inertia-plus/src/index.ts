import type {UnwrapNestedRefs} from 'vue';
import {router, useForm} from '@inertiajs/vue3';
import {onUnmounted, reactive, ref} from 'vue';
import {toast} from 'vue-sonner';
import type {InertiaForm} from '@inertiajs/vue3';
import type {ErrorValue, Method, UseFormSubmitOptions} from '@inertiajs/core';

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

type WithOpenable<TOptions extends InertiaPlusFormOptions, TData extends object> = TOptions extends {openable: true}
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

const defaultMinimumLoadingDuration = 1000;

export function toastFlashMessages(response: InertiaPlusToastResponse): void {
  const success = response.props.flash?.success;
  const error = response.props.flash?.error;

  if (success) toast.success(success);
  if (error) toast.error(error);
}

export function toastFirstValidationError(errors: Record<string, string>): void {
  const message = Object.values(errors)[0];

  if (message) toast.error(String(message));
}

function useSmoothForm(data: object, minimumLoadingDuration: number) {
  const form = useForm(data);
  const processing = ref(false);
  const inertiaMethods = {
    submit: form.submit,
    get: form.get,
    post: form.post,
    put: form.put,
    patch: form.patch,
    delete: form.delete,
  };
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => void) | null = null;

  function flushPending() {
    if (pending !== null) {
      const callback = pending;
      pending = null;
      callback();
    }
  }

  function cancelPending() {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }

    flushPending();
  }

  function afterMinimumDuration(startedAt: number, callback: () => void) {
    const remaining = Math.max(0, minimumLoadingDuration - (Date.now() - startedAt));
    cancelPending();

    if (remaining === 0) {
      callback();

      return;
    }

    pending = callback;
    timeout = setTimeout(() => {
      timeout = null;
      flushPending();
    }, remaining);
  }

  function waitForMinimumDuration(startedAt: number): Promise<void> {
    return new Promise((resolve) => afterMinimumDuration(startedAt, resolve));
  }

  function replaceErrors(errors: Record<string, ErrorValue>) {
    form.clearErrors();

    if (Object.keys(errors).length > 0) {
      form.setError(errors);
    }
  }

  function submit(method: Method, url: string, visitOptions: UseFormSubmitOptions = {}) {
    if (processing.value) {
      return;
    }

    const startedAt = Date.now();
    const previousErrors = {...form.errors};
    const {onSuccess, onError, onFinish} = visitOptions;

    processing.value = true;
    inertiaMethods.submit.call(form, method, url, {
      ...visitOptions,
      async onSuccess(page) {
        replaceErrors(previousErrors);
        await waitForMinimumDuration(startedAt);
        form.clearErrors();

        if (typeof onSuccess === 'function') {
          return onSuccess(page);
        }
      },
      async onError(errors) {
        replaceErrors(previousErrors);
        await waitForMinimumDuration(startedAt);
        replaceErrors(errors);

        if (typeof onError === 'function') {
          return onError(errors);
        }
      },
      onFinish(event) {
        afterMinimumDuration(startedAt, () => {
          processing.value = false;
          onFinish?.(event);
        });
      },
    });
  }

  onUnmounted(cancelPending);

  return new Proxy(form, {
    get(target, property, receiver) {
      if (property === 'processing') return processing.value;
      if (property === 'submit' && Reflect.get(target, property, receiver) === inertiaMethods.submit) return submit;
      if (property === 'get' && Reflect.get(target, property, receiver) === inertiaMethods.get) return (((url, options = {}) => submit('get', url, options)) as InertiaForm<object>['get']);
      if (property === 'post' && Reflect.get(target, property, receiver) === inertiaMethods.post) return (((url, options = {}) => submit('post', url, options)) as InertiaForm<object>['post']);
      if (property === 'put' && Reflect.get(target, property, receiver) === inertiaMethods.put) return (((url, options = {}) => submit('put', url, options)) as InertiaForm<object>['put']);
      if (property === 'patch' && Reflect.get(target, property, receiver) === inertiaMethods.patch) return (((url, options = {}) => submit('patch', url, options)) as InertiaForm<object>['patch']);
      if (property === 'delete' && Reflect.get(target, property, receiver) === inertiaMethods.delete) return (((url, options = {}) => submit('delete', url, options)) as InertiaForm<object>['delete']);

      return Reflect.get(target, property, receiver);
    },
    set(target, property, value) {
      if (property === 'processing') {
        processing.value = value;

        return true;
      }

      return Reflect.set(target, property, value);
    },
  });
}

export function useInertiaPlus<T extends object>(definition: T & ThisType<InertiaPlus<T>>): InertiaPlus<T> {
  if (Object.hasOwn(definition, 'reload')) {
    throw new TypeError('InertiaPlus member "reload" is managed.');
  }

  Object.defineProperty(definition, 'reload', {
    enumerable: false,
    value(options: Parameters<typeof router.reload>[0] = {}) {
      router.reload(options);
    },
  });

  // defineProperty adds the managed member without changing the input's inferred type.
  return ((reactive(definition)) as InertiaPlus<T>);
}

export function useInertiaPlusForm<TOptions extends InertiaPlusFormOptions, TDefinition extends object>(options: TOptions, definition: TDefinition & ThisType<InertiaPlusForm<TOptions, TDefinition>>): InertiaPlusForm<TOptions, TDefinition> {
  if (typeof options.minimumLoading !== 'boolean') {
    throw new TypeError('InertiaPlus form option "minimumLoading" must be a boolean.');
  }

  const descriptors: Record<string, PropertyDescriptor> = Object.getOwnPropertyDescriptors(definition);
  const data: Record<string, unknown> = {};

  for (const [member, descriptor] of Object.entries(descriptors)) {
    if (typeof descriptor.value === 'function' || descriptor.get || descriptor.set) {
      continue;
    }

    data[member] = descriptor.value;
    delete descriptors[member];
  }

  if (options.openable) {
    for (const member of ['isOpen', 'show', 'hide', 'setOpen']) {
      if (Object.hasOwn(descriptors, member)) {
        throw new TypeError(`InertiaPlus form member "${member}" is managed when openable.`);
      }
    }
  }

  const form = options.minimumLoading
    ? useSmoothForm(data, options.minimumLoadingDuration ?? defaultMinimumLoadingDuration)
    : useForm((data as object));

  if (!options.minimumLoading && Object.hasOwn(descriptors, 'submit')) {
    const inertiaSubmit = form.submit.bind(form);

    form.get = (url, requestOptions = {}) => inertiaSubmit('get', url, requestOptions);
    form.post = (url, requestOptions = {}) => inertiaSubmit('post', url, requestOptions);
    form.put = (url, requestOptions = {}) => inertiaSubmit('put', url, requestOptions);
    form.patch = (url, requestOptions = {}) => inertiaSubmit('patch', url, requestOptions);
    form.delete = (url, requestOptions = {}) => inertiaSubmit('delete', url, requestOptions);
  }

  for (const descriptor of Object.values(descriptors)) {
    if (typeof descriptor.value === 'function') {
      descriptor.value = descriptor.value.bind(form);
    }
  }

  Object.defineProperties(form, descriptors);

  if (options.openable) {
    // These managed members are installed together when openable is enabled.
    const openableForm = (form as InertiaForm<object> & OpenableInertiaPlusForm<object>);
    openableForm.isOpen = false;
    openableForm.show = (values) => {
      if (values !== undefined) {
        Object.assign(form, values);
      }

      openableForm.isOpen = true;
    };
    openableForm.hide = () => {
      openableForm.isOpen = false;
      form.resetAndClearErrors();
    };
    openableForm.setOpen = (open) => {
      open ? openableForm.show() : openableForm.hide();
    };
  }

  // Descriptor installation and conditional members implement the public mapped type.
  return (((form as unknown)) as InertiaPlusForm<TOptions, TDefinition>);
}
