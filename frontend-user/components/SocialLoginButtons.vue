<script setup lang="ts">
/**
 * CR-06 social login entry. Only providers the server reports as configured are
 * shown; with no keys registered the whole block is absent (no dead buttons).
 * Button colours follow each provider's mandatory login-button guideline.
 */
import { onMounted, ref } from 'vue'
import { useApiUrl } from '~/composables/useApi'

const props = withDefaults(defineProps<{ redirect?: string }>(), { redirect: '/my' })
const providers = ref<Array<{ id: 'kakao' | 'google' | 'naver'; label: string }>>([])

onMounted(async () => {
  try {
    const r = await fetch(useApiUrl('/auth/oauth/providers'))
    if (r.ok) providers.value = (await r.json()).providers || []
  } catch { providers.value = [] }
})

function start(id: string) {
  const back = `${window.location.origin}${props.redirect.startsWith('/') && !props.redirect.startsWith('//') ? props.redirect : '/my'}`
  window.location.assign(`${useApiUrl(`/auth/oauth/${id}/start`)}?returnTo=${encodeURIComponent(back)}`)
}

const STYLE: Record<string, string> = {
  kakao: 'bg-[#FEE500] text-[#191919] hover:brightness-95',
  naver: 'bg-[#03C75A] text-white hover:brightness-95',
  google: 'border border-line-strong bg-white text-[#1F1F1F] hover:bg-surface-sunken'
}
</script>

<template>
  <div v-if="providers.length" class="space-y-2" data-testid="social-login">
    <div class="relative my-5 text-center text-xs text-ink-subtle"><span class="relative z-10 bg-surface px-3">{{ $t('auth.socialTitle') }}</span><span class="absolute inset-x-0 top-1/2 h-px bg-line" aria-hidden="true" /></div>
    <button v-for="p in providers" :key="p.id" type="button" class="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition" :class="STYLE[p.id]" @click="start(p.id)">
      <span aria-hidden="true" class="grid h-5 w-5 place-items-center text-base font-black">{{ p.id === 'kakao' ? '●' : p.id === 'naver' ? 'N' : 'G' }}</span>
      {{ $t('auth.continueWith', { p: p.label }) }}
    </button>
    <p class="pt-1 text-center text-2xs text-ink-subtle">{{ $t('auth.firstTime') }}</p>
  </div>
</template>
