<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { onMounted } from 'vue'

const route = useRoute()
const router = useRouter()

onMounted(() => {
  const hotelId = route.query.hotelId || route.query.id
  if (hotelId) {
    router.replace(`/hotels/detail/${hotelId}`)
  } else {
    router.replace('/hotels/list')
  }
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    호텔 페이지로 이동 중...
  </div>
</template>
