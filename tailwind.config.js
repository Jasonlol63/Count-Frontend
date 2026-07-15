/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      screens: {
        'ec-s': { min: '768px', max: '991.98px' },
        'ec-m': { min: '992px', max: '1199.98px' },
        'ec-l': { min: '1200px', max: '1439.98px' },
        'ec-xl': '1440px',
      },
    },
  },
  plugins: [],
};
