import type { InjectionKey, Ref } from "vue"

export const sheetPortalToKey = Symbol("sheetPortalTo") as InjectionKey<Ref<string | HTMLElement | null | undefined>>
