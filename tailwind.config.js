/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Main color: Cyan/Teal
        primary: {
          50: '#ecfeff',
          100: '#cffafe',
          200: '#a5f3fc',
          300: '#67e8f9',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
          800: '#155e75',
          900: '#164e63',
        },
        // Glass effect specific colors
        glass: {
          white: 'rgba(255, 255, 255, 0.1)',
          'white-strong': 'rgba(255, 255, 255, 0.15)',
          border: 'rgba(255, 255, 255, 0.15)',
          'border-hover': 'rgba(255, 255, 255, 0.25)',
          hover: 'rgba(255, 255, 255, 0.2)',
        },
      },
      backdropBlur: {
        xs: '2px',
        glass: '12px',
        'glass-strong': '20px',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(0, 0, 0, 0.3)',
        'glass-hover': '0 12px 40px rgba(0, 0, 0, 0.4)',
        'glass-inset': 'inset 0 1px 1px rgba(255, 255, 255, 0.1)',
        'glow': '0 0 20px rgba(6, 182, 212, 0.3)',
        'glow-strong': '0 0 30px rgba(6, 182, 212, 0.5)',
        'glow-emerald': '0 0 20px rgba(16, 185, 129, 0.4)',
        'glow-amber': '0 0 20px rgba(245, 158, 11, 0.4)',
        'glow-rose': '0 0 20px rgba(244, 63, 94, 0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'float': 'float 3s ease-in-out infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 20px rgba(6, 182, 212, 0.3)' },
          '100%': { boxShadow: '0 0 30px rgba(6, 182, 212, 0.6)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      transitionDuration: {
        'micro': '150ms',
        'standard': '300ms',
        'emphasis': '500ms',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
