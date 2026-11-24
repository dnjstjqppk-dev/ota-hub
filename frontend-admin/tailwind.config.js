/**
 * getfortrip admin console — design system "Meridian Ops" (unified with frontend-user).
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
          50: '#E7F5F2', 100: '#CBEAE4', 200: '#9AD5C9', 300: '#64BCAC', 400: '#2DBFA8',
          500: '#0D6B5E', 600: '#09544A', 700: '#08433B', 800: '#07352F', 900: '#062925', 950: '#041B18'
        },
        horizon: { 300: '#8CE5D6', 400: '#4FD1BE', 500: '#20B29D', 600: '#0D8A78' },
        coral: { 50: '#FDF0EA', 100: '#FADAD0', 400: '#E57A57', 500: '#D05A34', 600: '#B54724', 700: '#8F361A' },
        midnight: { 700: '#1D2D2B', 800: '#142120', 900: '#0E1716', 950: '#080E0E' }
      },
      fontFamily: {
        sans: ['"Pretendard Variable"', 'Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace']
      },
      fontSize: { '2xs': ['0.6875rem', { lineHeight: '1rem' }] },
      borderRadius: { card: '1.125rem', field: '0.75rem' },
      boxShadow: {
        card: '0 1px 2px rgb(18 24 23 / 0.04), 0 6px 20px -6px rgb(18 24 23 / 0.07)',
        pop: '0 16px 44px -10px rgb(18 24 23 / 0.22), 0 2px 8px rgb(18 24 23 / 0.06)',
        focus: '0 0 0 4px rgb(var(--gft-primary) / 0.16)'
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
