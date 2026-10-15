<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { onMounted } from 'vue'

const route = useRoute()
const router = useRouter()

onMounted(() => {
  const id = route.params.id
  if (id) {
    router.replace(`/things-to-do/detail/${id}`)
  } else {
    router.replace('/things-to-do')
  }
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-24 text-center text-slate-400 font-bold">
    투어 상세 페이지로 이동 중...
  </div>
</template>
