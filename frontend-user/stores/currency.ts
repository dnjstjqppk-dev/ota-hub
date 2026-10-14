import { defineStore } from 'pinia'

export const useCurrencyStore = defineStore('currency', {
  state: () => ({
    activeCurrency: 'KRW',
    symbol: '₩',
    rates: {
      KRW: 1.0,
      USD: 1350.0,
      JPY: 9.10,
      EUR: 1470.0,
      CNY: 188.0,
      GBP: 1720.0
    } as Record<string, number>
  }),
  actions: {
    async fetchRates() {
      try {
        const config = useRuntimeConfig()
        const apiBase = config.public.apiBase || 'http://localhost:8080/api/v1'
        const res = await fetch(`${apiBase}/fx-rates`)
        const json = await res.json()
        if (json.data) {
          json.data.forEach((r: any) => {
            this.rates[r.currency] = r.rate_to_krw
          })
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
      const rate = this.rates[this.activeCurrency] || 1.0
      const converted = krwAmount / rate
      if (this.activeCurrency === 'KRW' || this.activeCurrency === 'JPY') {
        return `${this.symbol}${Math.round(converted).toLocaleString()}`
      }
      return `${this.symbol}${(Math.round(converted * 100) / 100).toFixed(2)}`
    }
  }
})
