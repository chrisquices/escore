import {router, useForm} from '@inertiajs/vue3';
import {onUnmounted, reactive, ref} from 'vue';
import {toast} from 'vue-sonner';

const defaultMinimumLoadingDuration = 1000;

export function toastFlashMessages(response) {
  const success = response.props.flash?.success;
  const error = response.props.flash?.error;

  if (success) toast.success(success);
  if (error) toast.error(error);
}

export function toastFirstValidationError(errors) {
  const message = Object.values(errors)[0];

  if (message) toast.error(String(message));
}

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
  let timeout = null;
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

  function waitForMinimumDuration(startedAt) {
    return new Promise((resolve) => afterMinimumDuration(startedAt, resolve));
  }

  function replaceErrors(errors) {
    form.clearErrors();

    if (Object.keys(errors).length > 0) {
      form.setError(errors);
    }
  }

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
      if (property === 'get' && Reflect.get(target, property, receiver) === inertiaMethods.get) return (url, options = {}) => submit('get', url, options);
      if (property === 'post' && Reflect.get(target, property, receiver) === inertiaMethods.post) return (url, options = {}) => submit('post', url, options);
      if (property === 'put' && Reflect.get(target, property, receiver) === inertiaMethods.put) return (url, options = {}) => submit('put', url, options);
      if (property === 'patch' && Reflect.get(target, property, receiver) === inertiaMethods.patch) return (url, options = {}) => submit('patch', url, options);
      if (property === 'delete' && Reflect.get(target, property, receiver) === inertiaMethods.delete) return (url, options = {}) => submit('delete', url, options);

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

export function useInertiaPlus(definition) {
  if (Object.hasOwn(definition, 'reload')) {
    throw new TypeError('InertiaPlus member "reload" is managed.');
  }

  Object.defineProperty(definition, 'reload', {
    enumerable: false,
    value(options = {}) {
      router.reload(options);
    },
  });

  return reactive(definition);
}

export function useInertiaPlusForm(options, definition) {
  if (typeof options.minimumLoading !== 'boolean') {
    throw new TypeError('InertiaPlus form option "minimumLoading" must be a boolean.');
  }

  const descriptors = Object.getOwnPropertyDescriptors(definition);
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
    : useForm(data);

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
    form.isOpen = false;
    form.show = (values) => {
      if (values !== undefined) {
        Object.assign(form, values);
      }

      form.isOpen = true;
    };
    form.hide = () => {
      form.isOpen = false;
      form.resetAndClearErrors();
    };
    form.setOpen = (open) => {
      open ? form.show() : form.hide();
    };
  }

  return form;
}
