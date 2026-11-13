/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: 'rgb(var(--color-primary-rgb) / <alpha-value>)',
          hover: 'rgb(var(--color-primary-hover-rgb) / <alpha-value>)',
          soft: 'rgb(var(--color-primary-soft-rgb) / <alpha-value>)',
        },
        accent: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
        ink: 'rgb(var(--color-ink-rgb) / <alpha-value>)',
        text: 'rgb(var(--color-text-rgb) / <alpha-value>)',
        muted: 'rgb(var(--color-muted-rgb) / <alpha-value>)',
        border: 'rgb(var(--color-border-rgb) / <alpha-value>)',
        canvas: 'rgb(var(--color-canvas-rgb) / <alpha-value>)',
        surface: 'rgb(var(--color-surface-rgb) / <alpha-value>)',
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
