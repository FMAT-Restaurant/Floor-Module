/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#C2410C',
          hover: '#9A3412',
          soft: '#FFF7ED',
        },
        accent: '#F97316',
        ink: '#111827',
        text: '#374151',
        muted: '#6B7280',
        border: '#E5E7EB',
        canvas: '#F8FAFC',
        surface: '#FFFFFF',
      },
      borderRadius: {
        control: '8px',
        card: '12px',
        sm: '4px',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      },
      height: {
        control: '40px',
        'control-touch': '48px',
      },
      minHeight: {
        control: '40px',
        'control-touch': '48px',
      },
    },
  },
  plugins: [],
};
