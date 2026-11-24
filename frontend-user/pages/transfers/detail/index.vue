<script setup lang="ts">
const route = useRoute()
const id = (route.query.id || route.query.transferId || 'tf_icn_van_01') as string
await navigateTo(useLocalePath()(`/transfers/detail/${id}`), { replace: true })
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    {{ $t('redirect.detail') }}
  </div>
</template>


