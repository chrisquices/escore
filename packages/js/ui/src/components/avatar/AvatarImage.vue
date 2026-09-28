<script setup lang="ts">
import type {AvatarImageProps} from "reka-ui"
import {ref} from "vue"
import {AvatarImage} from "reka-ui"

const props = defineProps<AvatarImageProps>()
const imageIsLoaded = ref(false)

function handleLoadingStatusChange(status: "idle" | "loading" | "loaded" | "error") {
  imageIsLoaded.value = status === "loaded"
}
</script>

<template>
  <AvatarImage
      data-slot="avatar-image"
      v-bind="props"
      :class="[
        'aspect-square size-full object-cover',
        imageIsLoaded && 'avatar-image-loaded',
      ]"
      @loading-status-change="handleLoadingStatusChange"
  >
    <slot/>
  </AvatarImage>
</template>

<style scoped>
.avatar-image-loaded {
  animation: avatar-image-in 200ms ease-out both;
}

@keyframes avatar-image-in {
  from {
    opacity: 0;
    transform: scale(0.96);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .avatar-image-loaded {
    animation: none;
  }
}
</style>
