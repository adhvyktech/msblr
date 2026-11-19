import type { Config } from 'tailwindcss';

// Every colour is a CSS variable (see src/app/theme.css) so directions A/B/C switch at runtime.
// color-mix keeps opacity modifiers (bg-primary/10) working with plain hex variables.
const token = (name: string) =>
  (({ opacityValue }: { opacityValue?: string | number }) =>
  opacityValue === undefined || String(opacityValue) === '1' || String(opacityValue).startsWith('var(')
    ? `var(--${name})`
    : `color-mix(in srgb, var(--${name}) ${Math.round(Number(opacityValue) * 100)}%, transparent)`) as unknown as string;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        ink: token('text'),
        muted: token('muted'),
        line: token('line'),
        primary: token('primary'),
        'primary-2': token('primary-2'),
        accent: token('accent'),
        'accent-soft': token('accent-soft'),
        gold: token('gold'),
        'on-primary': token('on-primary'),
        success: token('success'),
        'success-soft': token('success-soft'),
        warning: token('warning'),
        'warning-soft': token('warning-soft'),
        danger: token('danger'),
        'danger-soft': token('danger-soft'),
        info: token('info'),
        'info-soft': token('info-soft'),
      },
      borderRadius: { theme: 'var(--r)', 'theme-sm': 'calc(var(--r) - 4px)', 'theme-xs': 'calc(var(--r) - 8px)' },
      fontFamily: { head: ['var(--head)'], body: ['var(--body)'] },
      fontWeight: { head: 'var(--hw)' as unknown as string },
      boxShadow: { card: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 16px rgb(0 0 0 / 0.04)', pop: '0 12px 40px rgb(0 0 0 / 0.18)' },
      screens: { lg: '1024px' },
    },
  },
  plugins: [],
} satisfies Config;
