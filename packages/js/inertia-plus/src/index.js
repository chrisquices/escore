import {router, useForm} from '@inertiajs/vue3';
import {onUnmounted, reactive, ref} from 'vue';
import {toast} from 'vue-sonner';

/** @import {InertiaForm} from '@inertiajs/vue3' */
/** @import {ErrorValue, Method, UseFormSubmitOptions} from '@inertiajs/core' */
/** @import {InertiaPlus, InertiaPlusForm, InertiaPlusFormOptions, InertiaPlusToastResponse, OpenableInertiaPlusForm} from './index.d.ts' */

const defaultMinimumLoadingDuration = 1000;

/** @param {InertiaPlusToastResponse} response */
export function toastFlashMessages(response) {
  const success = response.props.flash?.success;
  const error = response.props.flash?.error;

  if (success) toast.success(success);
  if (error) toast.error(error);
}

/** @param {Record<string, string>} errors */
export function toastFirstValidationError(errors) {
  const message = Object.values(errors)[0];

  if (message) toast.error(String(message));
}

/**
 * @param {object} data
 * @param {number} minimumLoadingDuration
 */
function useSmoothForm(data, minimumLoadingDuration) {
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
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timeout = null;
  /** @type {(() => void) | null} */
  let pending = null;

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

  /** @param {number} startedAt @param {() => void} callback */
  function afterMinimumDuration(startedAt, callback) {
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

  /** @param {number} startedAt @returns {Promise<void>} */
  function waitForMinimumDuration(startedAt) {
    return new Promise((resolve) => afterMinimumDuration(startedAt, resolve));
  }

  /** @param {Record<string, ErrorValue>} errors */
  function replaceErrors(errors) {
    form.clearErrors();

    if (Object.keys(errors).length > 0) {
      form.setError(errors);
    }
  }

  /** @param {Method} method @param {string} url @param {UseFormSubmitOptions} [visitOptions] */
  function submit(method, url, visitOptions = {}) {
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
      if (property === 'get' && Reflect.get(target, property, receiver) === inertiaMethods.get) return /** @type {InertiaForm<object>['get']} */ ((url, options = {}) => submit('get', url, options));
      if (property === 'post' && Reflect.get(target, property, receiver) === inertiaMethods.post) return /** @type {InertiaForm<object>['post']} */ ((url, options = {}) => submit('post', url, options));
      if (property === 'put' && Reflect.get(target, property, receiver) === inertiaMethods.put) return /** @type {InertiaForm<object>['put']} */ ((url, options = {}) => submit('put', url, options));
      if (property === 'patch' && Reflect.get(target, property, receiver) === inertiaMethods.patch) return /** @type {InertiaForm<object>['patch']} */ ((url, options = {}) => submit('patch', url, options));
      if (property === 'delete' && Reflect.get(target, property, receiver) === inertiaMethods.delete) return /** @type {InertiaForm<object>['delete']} */ ((url, options = {}) => submit('delete', url, options));

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

/**
 * @template {object} T
 * @param {T & ThisType<InertiaPlus<T>>} definition
 * @returns {InertiaPlus<T>}
 */
export function useInertiaPlus(definition) {
  if (Object.hasOwn(definition, 'reload')) {
    throw new TypeError('InertiaPlus member "reload" is managed.');
  }

  Object.defineProperty(definition, 'reload', {
    enumerable: false,
    /** @param {Parameters<typeof router.reload>[0]} [options] */
    value(options = {}) {
      router.reload(options);
    },
  });

  // defineProperty adds the managed member without changing the input's inferred type.
  return /** @type {InertiaPlus<T>} */ (reactive(definition));
}

/**
 * @template {InertiaPlusFormOptions} TOptions
 * @template {object} TDefinition
 * @param {TOptions} options
 * @param {TDefinition & ThisType<InertiaPlusForm<TOptions, TDefinition>>} definition
 * @returns {InertiaPlusForm<TOptions, TDefinition>}
 */
export function useInertiaPlusForm(options, definition) {
  if (typeof options.minimumLoading !== 'boolean') {
    throw new TypeError('InertiaPlus form option "minimumLoading" must be a boolean.');
  }

  /** @type {Record<string, PropertyDescriptor>} */
  const descriptors = Object.getOwnPropertyDescriptors(definition);
  /** @type {Record<string, unknown>} */
  const data = {};

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
    : useForm(/** @type {object} */ (data));

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
    const openableForm = /** @type {InertiaForm<object> & OpenableInertiaPlusForm<object>} */ (form);
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
  return /** @type {InertiaPlusForm<TOptions, TDefinition>} */ (/** @type {unknown} */ (form));
}
