/**
 * getfortrip partner extranet — design system "Solstice Partner" (unified with frontend-user).
 * Semantic colours resolve to CSS variables in src/style.css so light and dark share one vocabulary.
 *
 * @type {import('tailwindcss').Config}
 */
const v = (name) => `rgb(var(--gft-${name}) / <alpha-value>)`

module.exports = {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: v('canvas'),
        surface: { DEFAULT: v('surface'), raised: v('surface-raised'), sunken: v('surface-sunken') },
        ink: { DEFAULT: v('ink'), muted: v('ink-muted'), subtle: v('ink-subtle'), inverse: v('ink-inverse') },
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        primary: { DEFAULT: v('primary'), hover: v('primary-hover'), soft: v('primary-soft'), ink: v('primary-ink') },
        accent: { DEFAULT: v('accent'), soft: v('accent-soft') },
        success: { DEFAULT: v('success'), soft: v('success-soft') },
        warning: { DEFAULT: v('warning'), soft: v('warning-soft') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        sapphire: {
          50: '#EEF1FF', 100: '#DCE3FF', 200: '#BAC7FF', 300: '#8FA5FF', 400: '#5C78FF',
          500: '#2948FF', 600: '#1B36E0', 700: '#162BB8', 800: '#132494', 900: '#101D75', 950: '#09114A'
        },
        horizon: { 300: '#A5B8FF', 400: '#7892FF', 500: '#4E6EFF', 600: '#2948FF' },
        coral: { 50: '#FFF0EC', 100: '#FFDCD3', 400: '#FF7D5C', 500: '#FF5733', 600: '#E04220', 700: '#B83216' },
        midnight: { 700: '#1D2952', 800: '#131C3B', 900: '#0B1126', 950: '#060917' },
        partner: {
          navy: '#0B1126',
          blue: '#2948FF',
          orange: '#FF5733',
          dark: '#060917'
        }
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', '"Pretendard Variable"', 'Pretendard', '-apple-system', 'sans-serif'],
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
      borderRadius: { card: '1.125rem', field: '0.75rem' },
      boxShadow: {
        card: '0 1px 2px rgb(12 19 38 / 0.04), 0 8px 24px -8px rgb(12 19 38 / 0.07)',
        pop: '0 20px 48px -12px rgb(12 19 38 / 0.22), 0 2px 8px rgb(12 19 38 / 0.06)',
        focus: '0 0 0 4px rgb(var(--gft-primary) / 0.18)'
      },
      keyframes: {
        'pop-in': { from: { opacity: '0', transform: 'translateY(-4px) scale(0.98)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } }
      },
      animation: {
        'pop-in': 'pop-in 140ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'slide-in': 'slide-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)'
      }
    }
  },
  plugins: []
}
