import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
        telugu: ['var(--font-telugu)', 'var(--font-sans)', 'sans-serif'],
        hindi: ['var(--font-hindi)', 'var(--font-sans)', 'sans-serif'],
      },
      colors: {
        ink: {
          DEFAULT: '#0a0712',
          50: '#1a1428',
          100: '#120e1c',
          200: '#0f0a17',
          300: '#0a0712',
          400: '#070510',
          500: '#04030a',
        },
        cream: {
          DEFAULT: '#F4EEE4',
          dim: '#D5CDBF',
          muted: '#867B8E',
        },
        saffron: {
          DEFAULT: '#F59E0B',
          light: '#FBBF24',
          deep: '#C2410C',
        },
        magenta: {
          DEFAULT: '#E11D74',
          glow: '#F43F9D',
          deep: '#9F1254',
        },
        indigo: {
          night: '#1E1B4B',
          deep: '#312E81',
          glow: '#4F39E8',
        },
        raaga: {
          gold: '#F5E6B3',
          rose: '#F472B6',
          violet: '#8B5CF6',
        },
      },
      backgroundImage: {
        'aurora-hero':
          'conic-gradient(from 180deg at 50% 50%, #F59E0B 0deg, #E11D74 120deg, #4F39E8 240deg, #F59E0B 360deg)',
        'aurora-soft':
          'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(245,158,11,0.18) 0%, transparent 60%),' +
          'radial-gradient(ellipse 60% 80% at 100% 50%, rgba(225,29,116,0.14) 0%, transparent 60%),' +
          'radial-gradient(ellipse 80% 80% at 0% 100%, rgba(79,57,232,0.16) 0%, transparent 60%)',
        'raaga-gradient': 'linear-gradient(135deg, #F59E0B 0%, #E11D74 50%, #4F39E8 100%)',
        'ink-fade':
          'linear-gradient(180deg, rgba(10,7,18,0) 0%, rgba(10,7,18,0.6) 50%, rgba(10,7,18,1) 100%)',
      },
      boxShadow: {
        glow: '0 0 48px -12px rgba(245,158,11,0.35), 0 0 96px -24px rgba(225,29,116,0.25)',
        'glow-rose': '0 0 64px -16px rgba(225,29,116,0.5)',
        'glow-violet': '0 0 80px -20px rgba(79,57,232,0.5)',
        card: '0 24px 64px -32px rgba(0,0,0,0.6), 0 8px 24px -12px rgba(245,158,11,0.08)',
        'inset-rim': 'inset 0 1px 0 0 rgba(244,238,228,0.08), inset 0 0 0 1px rgba(244,238,228,0.04)',
      },
      borderRadius: {
        'asym-sm': '20px 4px 20px 4px',
        'asym-md': '28px 6px 28px 6px',
        'asym-lg': '40px 8px 40px 8px',
      },
      backdropBlur: {
        xs: '2px',
      },
      transitionTimingFunction: {
        raaga: 'cubic-bezier(0.22, 1, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        dive: 'cubic-bezier(0.77, 0, 0.175, 1)',
      },
      animation: {
        'aurora-spin': 'aurora-spin 40s linear infinite',
        'breathe': 'breathe 6s ease-in-out infinite',
        'float-slow': 'float 14s ease-in-out infinite',
        'grain-drift': 'grain-drift 12s steps(4) infinite',
        'shimmer': 'shimmer 2.4s linear infinite',
        'pulse-glow': 'pulse-glow 3s ease-in-out infinite',
      },
      keyframes: {
        'aurora-spin': { '0%': { transform: 'rotate(0)' }, '100%': { transform: 'rotate(360deg)' } },
        breathe: { '0%,100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.04)' } },
        float: {
          '0%,100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(0,-12px,0)' },
        },
        'grain-drift': {
          '0%': { transform: 'translate(0,0)' },
          '25%': { transform: 'translate(-4%,3%)' },
          '50%': { transform: 'translate(3%,-2%)' },
          '75%': { transform: 'translate(-2%,-3%)' },
          '100%': { transform: 'translate(0,0)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-glow': {
          '0%,100%': { opacity: '0.4', transform: 'scale(1)' },
          '50%': { opacity: '0.9', transform: 'scale(1.06)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
