import type { Config } from 'tailwindcss';
import plugin from 'tailwindcss/plugin';

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        // CrecheBooks brand colors
        creche: {
          primary: '#2563eb', // Blue
          secondary: '#10b981', // Green (money/success)
          warning: '#f59e0b', // Amber (alerts)
          danger: '#ef4444', // Red (arrears)
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      // TASK-UI-008: Responsive typography
      fontSize: {
        // Mobile-first responsive sizes
        'mobile-xs': ['0.625rem', { lineHeight: '0.875rem' }],
        'mobile-sm': ['0.75rem', { lineHeight: '1rem' }],
        'mobile-base': ['0.875rem', { lineHeight: '1.25rem' }],
        'mobile-lg': ['1rem', { lineHeight: '1.5rem' }],
        'mobile-xl': ['1.125rem', { lineHeight: '1.75rem' }],
      },
      // TASK-UI-008: Touch-friendly spacing
      spacing: {
        // Touch target sizes (WCAG 2.5.5 Level AAA: 44x44 minimum)
        'touch': '44px',
        'touch-lg': '48px',
        // Safe area insets
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      // TASK-UI-008: Mobile breakpoint utilities
      screens: {
        // Extra small devices (portrait phones)
        'xs': '375px',
        // Touch devices (useful for hover states)
        'touch': { 'raw': '(hover: none) and (pointer: coarse)' },
        // Non-touch devices
        'no-touch': { 'raw': '(hover: hover) and (pointer: fine)' },
        // Landscape orientation
        'landscape': { 'raw': '(orientation: landscape)' },
        // Portrait orientation
        'portrait': { 'raw': '(orientation: portrait)' },
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        // TASK-UI-008: Touch feedback animation
        'tap-feedback': {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(0.97)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'tap': 'tap-feedback 0.15s ease-out',
      },
      // TASK-UI-008: Min sizes for touch targets
      minHeight: {
        'touch': '44px',
        'touch-lg': '48px',
      },
      minWidth: {
        'touch': '44px',
        'touch-lg': '48px',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
    // TASK-UI-008: Custom mobile utility plugin
    plugin(function({ addUtilities }) {
      addUtilities({
        // Safe area padding utilities
        '.p-safe': {
          paddingTop: 'env(safe-area-inset-top)',
          paddingRight: 'env(safe-area-inset-right)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
        },
        '.pt-safe': {
          paddingTop: 'env(safe-area-inset-top)',
        },
        '.pb-safe': {
          paddingBottom: 'env(safe-area-inset-bottom)',
        },
        '.pl-safe': {
          paddingLeft: 'env(safe-area-inset-left)',
        },
        '.pr-safe': {
          paddingRight: 'env(safe-area-inset-right)',
        },
        // Touch target utilities
        '.touch-target': {
          minHeight: '44px',
          minWidth: '44px',
        },
        '.touch-target-lg': {
          minHeight: '48px',
          minWidth: '48px',
        },
        // Scrollbar utilities for mobile
        '.scrollbar-thin': {
          scrollbarWidth: 'thin',
        },
        '.scrollbar-none': {
          scrollbarWidth: 'none',
          '-ms-overflow-style': 'none',
          '&::-webkit-scrollbar': {
            display: 'none',
          },
        },
        // Tap highlight removal
        '.tap-transparent': {
          '-webkit-tap-highlight-color': 'transparent',
        },
        // Prevent text selection on interactive elements
        '.select-touch': {
          '-webkit-touch-callout': 'none',
          '-webkit-user-select': 'none',
          'user-select': 'none',
        },
        // Momentum scrolling
        '.scroll-touch': {
          '-webkit-overflow-scrolling': 'touch',
        },
      });
    }),
  ],
};

export default config;
