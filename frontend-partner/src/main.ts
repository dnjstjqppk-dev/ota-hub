import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import AppIcon from './components/AppIcon.vue'
import './style.css'

// Theme before first paint: saved choice, else the OS preference.
try {
  const saved = localStorage.getItem('gft_partner_theme')
  const dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
  document.documentElement.classList.toggle('dark', dark)
} catch { /* storage blocked: stay light */ }

const app = createApp(App)
app.component('AppIcon', AppIcon)
app.use(createPinia())
app.use(router)
app.mount('#app')
