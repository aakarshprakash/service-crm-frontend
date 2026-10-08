/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Inter for Latin; Noto covers Hindi (Devanagari) and Malayalam glyphs.
      fontFamily: { sans: ['Inter', 'Noto Sans Devanagari', 'Noto Sans Malayalam', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        // Servon brand styleboard: Electric Blue #2563EB (primary).
        brand: {
          50: '#EFF6FF', 100: '#DBEAFE', 200: '#BFDBFE', 300: '#93C5FD', 400: '#60A5FA',
          500: '#3B82F6', 600: '#2563EB', 700: '#1D4ED8', 800: '#1E40AF', 900: '#1E3A8A', 950: '#172554',
        },
        // Deep Navy #0B2545: sidebar, dark surfaces, headings on marketing pages.
        navy: { 700: '#163A63', 800: '#0F2F57', 900: '#0B2545', 950: '#071A33' },
        // Teal Green #10B981: success, growth, positive accents.
        accent: {
          50: '#ECFDF5', 100: '#D1FAE5', 200: '#A7F3D0', 300: '#6EE7B7', 400: '#34D399',
          500: '#10B981', 600: '#059669', 700: '#047857', 800: '#065F46', 900: '#064E3B',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(11 37 69 / 0.04), 0 1px 3px 0 rgb(11 37 69 / 0.06)',
        lift: '0 8px 24px -8px rgb(11 37 69 / 0.18)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #2563EB 0%, #10B981 100%)',
      },
      keyframes: {
        'fade-in': { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } },
      },
      animation: { 'fade-in': 'fade-in .18s ease-out' },
    },
  },
  plugins: [],
};
