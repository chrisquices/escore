import type { InjectionKey, Ref } from "vue"
import type { SlotProps } from "vue-input-otp"

export const inputOTPSlotsKey: InjectionKey<Readonly<Ref<SlotProps[]>>> = Symbol("inputOTPSlots")
