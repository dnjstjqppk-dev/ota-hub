/**
 * getfortrip partner extranet — design system "Horizon" (same tokens as frontend-user, BRANDING.md palette).
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
          50: '#EEF4FF', 100: '#D9E6FF', 200: '#B5CEFF', 300: '#84ADFF', 400: '#4F87FF',
          500: '#1A6BFF', 600: '#0F56E0', 700: '#0C44B3', 800: '#0E3A8C', 900: '#102F6B', 950: '#0B1E45'
        },
        horizon: { 300: '#7DE6FF', 400: '#33DBFF', 500: '#00D2FF', 600: '#00A8CC' },
        coral: { 50: '#FFF1EC', 100: '#FFDCD1', 400: '#FF7A5C', 500: '#FF5A36', 600: '#E8431F', 700: '#BF3115' },
        midnight: { 700: '#1B2B44', 800: '#122036', 900: '#0B192C', 950: '#060F1C' },
        partner: {
          navy: '#0b192c',
          blue: '#1e3e62',
          orange: '#ff6500',
          dark: '#000000'
        }
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
      borderRadius: { card: '1rem', field: '0.75rem' },
      boxShadow: {
        card: '0 1px 2px rgb(11 25 44 / 0.04), 0 4px 16px -4px rgb(11 25 44 / 0.08)',
        pop: '0 12px 40px -8px rgb(11 25 44 / 0.22), 0 2px 6px rgb(11 25 44 / 0.06)',
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
