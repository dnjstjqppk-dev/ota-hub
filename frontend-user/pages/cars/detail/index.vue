<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { onMounted } from 'vue'

const route = useRoute()
const router = useRouter()

onMounted(() => {
  const id = route.query.id || route.query.carId || 'car-001'
  router.replace(`/cars/detail/${id}`)
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    렌터카 상세 페이지로 이동 중...
  </div>
</template>
