// CR-08: one toast channel for the storefront. Short confirmations and
// recoverable errors; anything the user must act on stays inline in the form.
import { defineStore } from 'pinia'

export type ToastTone = 'success' | 'error' | 'info'
export interface Toast { id: number; tone: ToastTone; text: string }

let seq = 0

export const useToastStore = defineStore('toast', {
  state: () => ({ items: [] as Toast[] }),
  actions: {
    push(text: string, tone: ToastTone = 'info', ms = 3500) {
      const id = ++seq
      this.items = [...this.items.slice(-2), { id, tone, text }]
      if (import.meta.client) setTimeout(() => this.dismiss(id), ms)
      return id
    },
    success(text: string) { return this.push(text, 'success') },
    error(text: string) { return this.push(text, 'error', 5000) },
    dismiss(id: number) { this.items = this.items.filter((t) => t.id !== id) }
  }
})
