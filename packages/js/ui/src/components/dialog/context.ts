import type { InjectionKey, Ref } from "vue"

export const dialogDismissibleKey: InjectionKey<Readonly<Ref<boolean>>> = Symbol("dialogDismissible")
export const dialogProcessingKey: InjectionKey<Readonly<Ref<boolean>>> = Symbol("dialogProcessing")
