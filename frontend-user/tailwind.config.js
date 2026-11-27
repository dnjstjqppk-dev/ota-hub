/**
 * getfortrip design system — "Solstice Atelier".
 * Contemporary luxury-editorial OTA palette: Alabaster Pearl canvas,
 * Electric Cobalt Indigo primary, Solar Coral Sunset accent, Deep Celestial Navy dark chrome.
 * Semantic colours resolve to CSS variables (assets/css/tailwind.css) so light and dark
 * themes share one class vocabulary: bg-surface, text-ink, border-line, bg-primary ...
 *
 * @type {import('tailwindcss').Config}
 */
const v = (name) => `rgb(var(--gft-${name}) / <alpha-value>)`

module.exports = {
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic tokens (theme-aware)
        canvas: v('canvas'),
        surface: { DEFAULT: v('surface'), raised: v('surface-raised'), sunken: v('surface-sunken') },
        ink: { DEFAULT: v('ink'), muted: v('ink-muted'), subtle: v('ink-subtle'), inverse: v('ink-inverse') },
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        primary: { DEFAULT: v('primary'), hover: v('primary-hover'), soft: v('primary-soft'), ink: v('primary-ink') },
        accent: { DEFAULT: v('accent'), soft: v('accent-soft') },
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },

        // Brand scales — Solstice Cobalt / Periwinkle / Solar Coral / Celestial Cosmos
        sapphire: {
          50: '#EEF1FF', 100: '#DCE3FF', 200: '#BAC7FF', 300: '#8FA5FF', 400: '#5C78FF',
          500: '#2948FF', 600: '#1B36E0', 700: '#162BB8', 800: '#132494', 900: '#101D75', 950: '#09114A'
        },
        horizon: { 300: '#A5B8FF', 400: '#7892FF', 500: '#4E6EFF', 600: '#2948FF' },
        coral: { 50: '#FFF0EC', 100: '#FFDCD3', 400: '#FF7D5C', 500: '#FF5733', 600: '#E04220', 700: '#B83216' },
        midnight: { 700: '#1D2952', 800: '#131C3B', 900: '#0B1126', 950: '#060917' },

        // Legacy aliases: cleanly remapped to Solstice tokens
        trip: {
          blue: '#2948FF',
          hover: '#1B36E0',
          navy: '#0B1126',
          dark: '#060917',
          orange: '#FF5733',
          yellow: '#E59B14',
          bg: '#F5F7FC',
          border: '#DCE3F2'
        }
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', '"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }]
      },
      borderRadius: {
        card: '1.375rem',
        field: '0.875rem'
      },
      boxShadow: {
        card: '0 1px 2px rgb(12 19 38 / 0.04), 0 8px 24px -8px rgb(12 19 38 / 0.08)',
        pop: '0 20px 48px -12px rgb(12 19 38 / 0.22), 0 2px 8px rgb(12 19 38 / 0.06)',
        focus: '0 0 0 4px rgb(var(--gft-primary) / 0.18)'
      },
      keyframes: {
        'pop-in': { from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } }
      },
      animation: {
        'pop-in': 'pop-in 140ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        shimmer: 'shimmer 1.4s infinite'
      }
    },
  },
  plugins: [],
}
