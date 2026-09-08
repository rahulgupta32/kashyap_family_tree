/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        saffron: {
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
        maroon: {
          500: '#991b1b',
          700: '#651717',
        },
        gold: {
          500: '#d97706',
        }
      },
    },
  },
  plugins: [],
}
