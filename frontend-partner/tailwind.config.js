/**
 * getfortrip partner extranet — design system "Terra Nord Partner" (unified with frontend-user).
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
          50: '#ECF6F3', 100: '#D3ECE4', 200: '#A9DACB', 300: '#74C1AC', 400: '#3FA289',
          500: '#0F6A53', 600: '#0B5441', 700: '#094335', 800: '#08362B', 900: '#062B22', 950: '#041A15'
        },
        horizon: { 300: '#8AD4BF', 400: '#55B99E', 500: '#238C70', 600: '#0F6A53' },
        coral: { 50: '#FDF1EC', 100: '#FBE0D5', 400: '#E87E56', 500: '#D95D30', 600: '#BA4920', 700: '#963817' },
        midnight: { 700: '#24312C', 800: '#19231F', 900: '#111815', 950: '#0A0F0D' },
        partner: {
          navy: '#111815',
          blue: '#0F6A53',
          orange: '#D95D30',
          dark: '#0A0F0D'
        }
      },
      fontFamily: {
        display: ['"Outfit"', '"Pretendard Variable"', 'Pretendard', '-apple-system', 'sans-serif'],
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
      borderRadius: { card: '1.125rem', field: '0.75rem' },
      boxShadow: {
        card: '0 1px 2px rgb(20 26 24 / 0.04), 0 8px 24px -10px rgb(20 26 24 / 0.07)',
        pop: '0 22px 48px -12px rgb(20 26 24 / 0.18), 0 2px 8px rgb(20 26 24 / 0.06)',
        focus: '0 0 0 3px rgb(var(--gft-primary) / 0.2)'
      },
      keyframes: {
        'pop-in': { from: { opacity: '0', transform: 'translateY(-4px) scale(0.985)' }, to: { opacity: '1', transform: 'none' } },
        'slide-in': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } }
      },
      animation: {
        'pop-in': 'pop-in 150ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        'slide-in': 'slide-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)'
      }
    }
  },
  plugins: []
}
