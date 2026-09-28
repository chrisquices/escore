# Using Wayfinder

Use Wayfinder when available; otherwise use Ziggy or the project's existing routing helper. 

Do not hardcode URLs when a routing helper exists. 

Use actual generated actions or route names; do not invent them.

For Wayfinder, use namespace controller imports (`import * as`) and pass the action's `.url` to the explicit HTTP method.

Do not use default/named action imports or pass the action object directly.

```ts
import * as KeyController from '@/actions/App/Http/Controllers/KeyController';

this.patch(KeyController.update(this.uid).url, {
    onSuccess: () => this.hide(),
});
```
