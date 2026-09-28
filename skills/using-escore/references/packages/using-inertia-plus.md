# Using Inertia Plus

Import from `escore-packages/inertia-plus`. Reuse its behavior instead of implementing it again.

## Organization and Const Names

- Each `useInertiaPlus` object groups one domain's related state, getters, and methods: `keys`, `keyFiles`, `keyPreview`. Grouping depends on the feature; reloads are optional.
- Name form/dialog/alert dialogs consts as **action + subject + purpose**. For example:
  - Forms: `addKeyForm`, `editKeyForm`, `syncKeysForm`, `uploadKeyFileForm`.
  - Dialogs: `addKeyDialog`, `editKeyDialog`, `syncKeysDialog`, `uploadKeyFileDialog`.
  - Alert Dialogs: `deleteKeyAlertDialog`, `deleteKeyFileAlertDialog`. 
  - Use `Dialog` for dialogs with forms in them. Use `Alert Dialogs` for dialogs with confirmations.
- Avoid vague names such as `form`, `dialog`, or `uploadForm`. Dialog consts do not need an additional `Form` suffix.
- By default, give each form or dialog action its own const with one responsibility. Usually define only `submit()` and optional `beforeSubmit()`. Extra methods or a larger domain object are valid when needed, but are not the standard form/dialog pattern.
- Put preparation in the corresponding `before<Action>()` method, such as `beforeSubmit()`, called by the action itself. These are application conventions, not automatic library hooks.
- Buttons and form events call `submit()`. If preparation is needed, `submit()` calls `this.beforeSubmit()` after its processing guard and before the request. `beforeSubmit()` never calls `submit()` and is not called directly by the UI or automatically by the library.
- Use method syntax with `this`; use arrow callbacks inside methods to retain `this`.

## Capabilities

When first creating an action, use these defaults:

- Forms: `{ openable: false, minimumLoading: false }`.
- Dialogs and alert dialogs: `{ openable: true, minimumLoading: true }`.

These are rules of thumb. Preserve explicit user overrides.

| API | Description | Use Scenario | Required | Dependencies |
| --- | --- | --- | --- | --- |
| `useInertiaPlus(definition)` | Reactive state, methods, getters/setters, and nested refs/computed values. Adds `reload(options?)`. | Group related state and behavior into a domain. | No | |
| `reload(options?)` | Calls `router.reload()`. Without `only`, does not restrict returned page props. | Refresh page data; use `{ only: ['keys'] }` to target specific props. The domain's name does not select props. | No; explicitly called. | |
| `useInertiaPlusForm(options, definition)` | Inertia form data plus bound custom methods/getters/setters. HTTP methods still work with a custom `submit()`. | Keep a form's data and behavior together. | Default form pattern. | |
| Inherited form API | Processing, errors, upload progress, dirty/success state, HTTP methods, transforms, defaults, resetting, validation-error methods, and cancellation. | Submit requests and manage form state without duplicating built-in behavior. | Included automatically. | |
| `openable: true` | Adds `isOpen` (initially false), `show(values?)`, `hide()`, and `setOpen(open)`. | Forms presented in a dialog, sheet, drawer, or similar surface. | No | |
| `minimumLoading: true` | Minimum request-processing duration; delays success/error/finish handling and error replacement; blocks repeat HTTP submissions. Defaults to 1,000 ms; override with `minimumLoadingDuration`. | Prevent loading indicators from flickering during quick requests. | The boolean is required; enabling it is optional. | |
| `toastFlashMessages(page)` | Displays `page.props.flash.success` and `.error` through `toast.success()` and `toast.error()`. | Show server-provided success/error feedback, usually in `onSuccess`. | No; explicitly called. | `vue-sonner` and a mounted Toaster. |
| `toastFirstValidationError(errors)` | Displays the first validation error through `toast.error()`. | Show validation feedback, usually in `onError`. | No; explicitly called. | `vue-sonner` and a mounted Toaster. |

Set `minimumLoading` explicitly; it is required. With `false`, add a processing guard when needed. 

Plain `useInertiaPlus` has no form processing or open/close lifecycle. 

Do not redefine managed members or create duplicate processing/error refs. 

## Lifecycle: Do Not Duplicate

- `show()` opens; `show(values)` also assigns supplied fields. Neither resets fields, changes defaults, nor clears errors.
- `hide()` closes, resets fields to current defaults, and clears errors. `setOpen(false)` calls `hide()`; `setOpen(true)` calls `show()`.
- After success, `this.hide()` is sufficient for an openable form. Do not also reset fields, clear errors, or add a close watcher.
- Success does not automatically close or reset a form. An inline add-key form may need an explicit success reset.
- Bind `:open="editKeyDialog.isOpen"` and `@update:open="editKeyDialog.setOpen"`. Direct assignment or `v-model:open` bypasses close cleanup.
- Closing does not cancel requests. Guard closing while processing when needed.
- Local validation, preparation, queue handling, and domain-specific cleanup remain application responsibilities.

## Examples

### Domain State — Keys

```ts
const keys = useInertiaPlus({
    selectedKeyUid: null as string | null,

    selectKey(key: Key): void {
        this.selectedKeyUid = key.uid;
    },

    clearSelection(): void {
        this.selectedKeyUid = null;
    },
});
```

### Domain State — Keys CRUD

Use one const per action, with separate form and dialog versions. Examples assume `Key` has `uid` and `name`, and the project provides generated `KeyController` actions.

#### Forms

```ts
const addKeyForm = useInertiaPlusForm({ openable: false, minimumLoading: false }, {
    name: '',

    beforeSubmit(): void {
        this.name = this.name.trim();
    },

    submit(): void {
        if (this.processing) return;
        this.beforeSubmit();
        
        this.post(KeyController.store().url, {
            onSuccess: () => { this.resetAndClearErrors(); },
            onError: toastFirstValidationError,
        });
    },
});

const deleteKeyForm = useInertiaPlusForm({ openable: false, minimumLoading: false }, {
    uid: '',

    beforeSubmit(key: Key): void {
        this.uid = key.uid;
    },

    submit(key: Key): void {
        if (this.processing) return;
        this.beforeSubmit(key);
        
        this.delete(KeyController.deleteMethod(this.uid).url, {
            onSuccess: () => { this.resetAndClearErrors(); },
            onError: toastFirstValidationError,
        });
    },
});
```

The UI calls `addKeyForm.submit()` or `deleteKeyForm.submit(key)`. Each method calls its own preparation before sending the request.

#### Dialogs

```ts
const addKeyDialog = useInertiaPlusForm({ openable: true, minimumLoading: true }, {
    name: '',

    beforeSubmit(): void {
        this.name = this.name.trim();
    },

    submit(): void {
        if (this.processing) return;
        this.beforeSubmit();

        this.post(KeyController.store().url, {
            onSuccess: () => this.hide(),
            onError: toastFirstValidationError,
        });
    },
});

const editKeyDialog = useInertiaPlusForm({ openable: true, minimumLoading: true }, {
    uid: '',
    name: '',

    beforeSubmit(): void {
        this.name = this.name.trim();
    },

    submit(): void {
        if (this.processing) return;
        this.beforeSubmit();
        
        this.patch(KeyController.update(this.uid).url, {
            onSuccess: () => this.hide(),
            onError: toastFirstValidationError,
        });
    },
});

const deleteKeyAlertDialog = useInertiaPlusForm({ openable: true, minimumLoading: true }, {
    uid: '',
    name: '',

    submit(): void {
        if (this.processing) return;
        
        this.delete(KeyController.deleteMethod(this.uid).url, {
            onSuccess: () => this.hide(),
            onError: toastFirstValidationError,
        });
    },
});
```

Open with:

- `addKeyDialog.show()`
- `editKeyDialog.show({ uid: key.uid, name: key.name })`
- `deleteKeyAlertDialog.show({ uid: key.uid, name: key.name })`

1. `show()` opens the dialog; `show(values)` also populates the supplied fields.
2. The user edits or confirms the values.
3. The submit/confirm button calls `submit()`.
4. `submit()` calls `beforeSubmit()` if preparation is needed, then sends the request.
