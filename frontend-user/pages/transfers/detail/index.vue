<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { onMounted } from 'vue'

const route = useRoute()
const router = useRouter()

onMounted(() => {
  const id = route.query.id || route.query.transferId || 'tf-001'
  router.replace(`/transfers/detail/${id}`)
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    공항픽업 상세 페이지로 이동 중...
  </div>
</template>

