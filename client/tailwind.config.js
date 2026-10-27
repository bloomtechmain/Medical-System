/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        brand: {
          DEFAULT: '#0d9488',
          dark:    '#0f766e',
          light:   '#ccfbf1',
        },
        // Suwela identity — sampled from the logo artwork. Used by the public
        // landing pages; the signed-in app keeps the primary/brand scales above.
        suwela: {
          navy:   '#0E2C52',
          ink:    '#16283F',
          slate:  '#54687E',
          sky:    '#31B0F7',
          blue:   '#1598E9',
          deep:   '#0279D1',
          mint:   '#43CE9F',
          green:  '#13A58F',
          forest: '#07947E',
          purple: '#6A4DB6',
          orange: '#EF7B2D',
          paper:  '#FAFAF6',
          line:   '#E2E7E3',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
        tech: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
