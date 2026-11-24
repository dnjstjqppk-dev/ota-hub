<script setup lang="ts">
const route = useRoute()
const hotelId = (route.query.hotelId || route.query.id || 'htl_tokyo_01') as string
await navigateTo(useLocalePath()(`/hotels/detail/${hotelId}`), { replace: true })
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    {{ $t('redirect.detail') }}
  </div>
</template>

