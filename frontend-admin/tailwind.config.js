/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        trip: {
          blue: '#287DFA',
          hover: '#0066F5',
          navy: '#0F294D',
          dark: '#08172B',
          bg: '#F5F7FA',
          border: '#E5E8ED'
        }
      }
    },
  },
  plugins: [],
}

