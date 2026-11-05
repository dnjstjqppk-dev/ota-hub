/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        partner: {
          navy: '#0b192c',
          blue: '#1e3e62',
          orange: '#ff6500',
          dark: '#000000',
        }
      }
    },
  },
  plugins: [],
}
