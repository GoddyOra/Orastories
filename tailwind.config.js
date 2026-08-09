/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['selector', '.dark-mode'],
  content: [
    './*.html',
    './scripts/**/*.js',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './contexts/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {}
  },
  plugins: []
};
