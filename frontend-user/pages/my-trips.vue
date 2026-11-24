<script setup lang="ts">
import { navigateTo } from '#app'

const localePath = useLocalePath()
await navigateTo(localePath('/my/bookings'), { replace: true })
</script>

<template>
  <div class="min-h-[50vh] flex items-center justify-center text-slate-400 text-xs">
    <span>{{ $t('my.moving') }}</span>
  </div>
</template>

