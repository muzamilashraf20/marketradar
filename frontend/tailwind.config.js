/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      /* BiasForge design tokens. Everything lives under `bf` so none of it
         shadows a Tailwind default: slate-400 still means slate-400, and every
         class already in the app renders exactly as before.

         The values are the ones styles/landing.css already uses as custom
         properties, so the landing page and the app draw from one palette.
         The -soft shades are the 400 steps, for text sitting on a tinted chip,
         where the 500 step reads heavy. */
      colors: {
        bf: {
          bg:            '#030712',
          deep:          '#020617',
          surface:       '#0b1220',
          raised:        '#0f172a',
          border:        '#1e293b',
          text:          '#f8fafc',
          'text-2':      '#94a3b8',
          // 5.75:1 on bg-bf-bg. slate-500 is 4.23:1 and fails AA at the
          // 11–13px sizes this is used for. Same grey as .bf-t3 and the blog.
          muted:         '#7c8aa0',
          accent:        '#06b6d4',
          'accent-soft': '#22d3ee',
          bull:          '#10b981',
          'bull-soft':   '#34d399',
          // Red is reserved for invalidation, risk and SELL.
          bear:          '#f43f5e',
          'bear-soft':   '#fb7185',
          warn:          '#f59e0b',
          'warn-soft':   '#fbbf24',
        },
      },
      fontSize: {
        '3xs': ['0.625rem', { lineHeight: '0.875rem' }],   // 10px — chip labels
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],      // 11px — meta lines
      },
      borderRadius: {
        chip: '0.375rem',
        card: '0.75rem',
      },
      boxShadow: {
        // A panel resting on the page: faint top highlight, soft drop.
        card: 'inset 0 1px 0 0 rgba(255,255,255,0.03), 0 8px 24px -16px rgba(0,0,0,0.7)',
        // The one controlled glow, for the headline bias only.
        glow: 'inset 0 1px 0 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(6,182,212,0.18), 0 12px 32px -16px rgba(6,182,212,0.35)',
      },
      transitionTimingFunction: {
        // The ease-out curve the landing page's entrances already use.
        bf: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
}
