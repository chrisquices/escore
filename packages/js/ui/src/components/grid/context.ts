import type { InjectionKey, Ref } from "vue"

export const gridVirtualizedKey = Symbol("gridVirtualized") as InjectionKey<Ref<boolean>>
