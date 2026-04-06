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
        raven: {
          bg: '#0a0a1a',
          surface: '#111827',
          border: '#1e293b',
          accent: '#6366f1',
          pink: '#ec4899',
          amber: '#f59e0b',
          muted: '#94a3b8',
          text: '#e2e8f0',
        },
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
