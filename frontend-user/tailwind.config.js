/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./components/**/*.{js,vue,ts}",
    "./layouts/**/*.vue",
    "./pages/**/*.vue",
    "./plugins/**/*.{js,ts}",
    "./app.vue",
    "./error.vue"
  ],
  theme: {
    extend: {
      colors: {
        trip: {
          blue: '#287DFA',
          hover: '#0066F5',
          navy: '#0F294D',
          dark: '#08172B',
          orange: '#FF5C00',
          yellow: '#FFB800',
          bg: '#F5F7FA',
          border: '#E5E8ED'
        }
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'Roboto', 'sans-serif']
      }
    },
  },
  plugins: [],
}

