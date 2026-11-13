import { defineStore } from 'pinia'

/**
 * #157: pure conversion core (unit-tested). Until live rates arrive the
 * hardcoded table below must never silently price anything — unloaded
 * conversions fail safe to KRW truth instead of fictional dollars.
 */
export function convertKrw(krwAmount: number, activeCurrency: string, rates: Record<string, number>, loaded: boolean): { amount: number; currency: string; symbol: string } {
  const symbols: Record<string, string> = { KRW: '₩', USD: '$', JPY: '¥', EUR: '€', CNY: '¥', GBP: '£' }
  if (!loaded) return { amount: krwAmount, currency: 'KRW', symbol: '₩' }
  const rate = rates[activeCurrency] || 1.0
  return { amount: krwAmount / rate, currency: activeCurrency, symbol: symbols[activeCurrency] || '$' }
}

export const useCurrencyStore = defineStore('currency', {
  state: () => ({
    activeCurrency: 'KRW',
    symbol: '₩',
    ratesLoaded: false,
    rates: {
      KRW: 1.0,
      USD: 1350.0,
      JPY: 9.10,
      EUR: 1470.0,
      CNY: 188.0,
      GBP: 1720.0
    } as Record<string, number>
  }),
  getters: {
    ratesStale: (s): boolean => !s.ratesLoaded,
  },
  actions: {
    async fetchRates() {
      try {
        const config = useRuntimeConfig()
        const apiBase = config.public.apiBase || 'http://localhost:8787/api/v1'
        const res = await fetch(`${apiBase}/fx-rates`)
        const json = await res.json()
        if (Array.isArray(json.rates)) {
          json.rates.forEach((r: any) => {
            if (r?.currency && Number.isFinite(Number(r.rate_to_krw))) this.rates[r.currency] = Number(r.rate_to_krw)
          })
          this.ratesLoaded = true
        }
      } catch (e) {
        console.error('Failed to fetch FX rates', e)
      }
    },
    setCurrency(curr: string) {
      this.activeCurrency = curr
      switch (curr) {
        case 'KRW': this.symbol = '₩'; break
        case 'USD': this.symbol = '$'; break
        case 'JPY': this.symbol = '¥'; break
        case 'EUR': this.symbol = '€'; break
        case 'CNY': this.symbol = '¥'; break
        case 'GBP': this.symbol = '£'; break
        default: this.symbol = '$'; break
      }
    },
    formatKRW(krwAmount: number): string {
      const { amount, currency, symbol } = convertKrw(krwAmount, this.activeCurrency, this.rates, this.ratesLoaded)
      if (currency === 'KRW' || currency === 'JPY') {
        return `${symbol}${Math.round(amount).toLocaleString()}`
      }
      return `${symbol}${(Math.round(amount * 100) / 100).toFixed(2)}`
    }
  }
})
