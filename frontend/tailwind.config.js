/** @type {import('tailwindcss').Config} */
import plugin from 'tailwindcss/plugin.js';

export default {
  content: ['./index.html', './src/**/*.{js,ts}'],
  darkMode: 'class',
  theme: {
    extend: {
      // ── Ethereal Peony colour tokens (from stitch_adaptive_tone_ai_chat/DESIGN.md) ──
      colors: {
        'surface':                   '#fcf9f8',
        'surface-dim':               '#dcd9d9',
        'surface-bright':            '#fcf9f8',
        'surface-container-lowest':  '#ffffff',
        'surface-container-low':     '#f6f3f2',
        'surface-container':         '#f0eded',
        'surface-container-high':    '#eae7e7',
        'surface-container-highest': '#e5e2e1',
        'on-surface':                '#1c1b1b',
        'on-surface-variant':        '#564149',
        'inverse-surface':           '#313030',
        'inverse-on-surface':        '#f3f0ef',
        'outline':                   '#897179',
        'outline-variant':           '#dcbfc9',
        'surface-tint':              '#ac2471',
        'primary':                   '#ac2471',
        'on-primary':                '#ffffff',
        'primary-container':         '#ff69b4',
        'on-primary-container':      '#6e0044',
        'inverse-primary':           '#ffb0d0',
        'secondary':                 '#81515a',
        'on-secondary':              '#ffffff',
        'secondary-container':       '#fdbec9',
        'on-secondary-container':    '#7a4a54',
        'tertiary':                  '#7212ff',
        'on-tertiary':               '#ffffff',
        'tertiary-container':        '#ae8bff',
        'on-tertiary-container':     '#43009f',
        'error':                     '#ba1a1a',
        'on-error':                  '#ffffff',
        'error-container':           '#ffdad6',
        'on-error-container':        '#93000a',
        'primary-fixed':             '#ffd8e6',
        'primary-fixed-dim':         '#ffb0d0',
        'background':                '#fcf9f8',
        'on-background':             '#1c1b1b',
        'surface-variant':           '#e5e2e1',
      },

      // ── Typography scale ──
      fontFamily: {
        sans:          ['"Plus Jakarta Sans"', 'sans-serif'],
        'display-lg':  ['"Plus Jakarta Sans"', 'sans-serif'],
        'headline-md': ['"Plus Jakarta Sans"', 'sans-serif'],
        'body-lg':     ['"Plus Jakarta Sans"', 'sans-serif'],
        'body-md':     ['"Plus Jakarta Sans"', 'sans-serif'],
        'label-sm':    ['Geist', 'monospace'],
      },
      fontSize: {
        'display-lg':        ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'display-lg-mobile': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-md':       ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'body-lg':           ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'body-md':           ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'label-sm':          ['12px', { lineHeight: '16px', letterSpacing: '0.05em', fontWeight: '500' }],
      },

      // ── Spacing (8px base grid) ──
      spacing: {
        'base':           '4px',
        'xs':             '8px',
        'sm':             '16px',
        'md':             '24px',
        'lg':             '48px',
        'xl':             '80px',
        'gutter':         '24px',
        'margin-mobile':  '16px',
        'margin-desktop': '64px',
      },

      // ── Border radius ──
      borderRadius: {
        DEFAULT: '0.5rem',
        sm:      '0.25rem',
        md:      '0.75rem',
        lg:      '1rem',
        xl:      '1.5rem',
        '2xl':   '1rem',
        '3xl':   '1.5rem',
        full:    '9999px',
      },

      // ── Custom animations ──
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%':      { transform: 'translate(20px, -30px) scale(1.05)' },
          '66%':      { transform: 'translate(-15px, 15px) scale(0.95)' },
        },
        typing: {
          '0%, 80%, 100%': { transform: 'scale(0)', opacity: '0.5' },
          '40%':           { transform: 'scale(1)',  opacity: '1' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(172, 36, 113, 0.2)' },
          '50%':      { boxShadow: '0 0 40px rgba(172, 36, 113, 0.5)' },
        },
      },
      animation: {
        float:      'float 8s ease-in-out infinite',
        typing:     'typing 1.4s ease-in-out infinite both',
        fadeInUp:   'fadeInUp 0.25s ease-out',
        shimmer:    'shimmer 2s linear infinite',
        pulseGlow:  'pulseGlow 2s ease-in-out infinite',
        spin:       'spin 1s linear infinite',
      },

      // ── Box shadow ──
      boxShadow: {
        'glow-primary': '0 0 32px rgba(172, 36, 113, 0.35)',
        'glow-soft':    '0 0 40px rgba(255, 105, 180, 0.15)',
        'card':         '0 8px 32px rgba(0, 0, 0, 0.08)',
        'bubble':       '0 4px 12px rgba(0, 0, 0, 0.06)',
      },
    },
  },

  plugins: [
    plugin(({ addComponents, addUtilities }) => {
      addComponents({
        // ── Glass surfaces ──
        '.glass-card': {
          background:               'rgba(255, 255, 255, 0.78)',
          backdropFilter:           'blur(32px)',
          '-webkit-backdrop-filter':'blur(32px)',
          border:                   '1px solid rgba(255, 255, 255, 0.65)',
          borderRadius:             '1.5rem',
          boxShadow:                '0 8px 40px rgba(0, 0, 0, 0.10)',
        },
        '.glass-surface': {
          background:               'rgba(255, 192, 203, 0.07)',
          backdropFilter:           'blur(20px)',
          '-webkit-backdrop-filter':'blur(20px)',
          border:                   '1px solid rgba(255, 255, 255, 0.22)',
        },
        '.glass-surface-strong': {
          background:               'rgba(255, 255, 255, 0.72)',
          backdropFilter:           'blur(28px)',
          '-webkit-backdrop-filter':'blur(28px)',
          border:                   '1px solid rgba(255, 255, 255, 0.55)',
        },
        '.glass-glow': {
          boxShadow: '0 0 40px 4px rgba(255, 105, 180, 0.07)',
        },

        // ── Input field ──
        '.input-field': {
          background:               'rgba(255, 255, 255, 0.65)',
          backdropFilter:           'blur(8px)',
          '-webkit-backdrop-filter':'blur(8px)',
          border:                   '1.5px solid rgba(220, 191, 201, 0.55)',
          borderRadius:             '0.75rem',
          padding:                  '0.75rem 1rem',
          color:                    '#1c1b1b',
          outline:                  'none',
          width:                    '100%',
          transition:               'border-color 0.2s, box-shadow 0.2s',
          fontFamily:               '"Plus Jakarta Sans", sans-serif',
          fontSize:                 '16px',
          '&::placeholder': {
            color: '#897179',
          },
          '&:focus': {
            borderColor: '#ac2471',
            boxShadow:   '0 0 0 3px rgba(172, 36, 113, 0.12)',
          },
        },

        // ── Primary button ──
        '.btn-primary': {
          background:    '#ac2471',
          color:         '#ffffff',
          borderRadius:  '0.75rem',
          fontWeight:    '600',
          transition:    'all 0.2s',
          boxShadow:     '0 4px 20px rgba(172, 36, 113, 0.28)',
          display:       'inline-flex',
          alignItems:    'center',
          justifyContent:'center',
          gap:           '0.5rem',
          cursor:        'pointer',
          border:        'none',
          '&:hover:not(:disabled)': {
            opacity:   '0.92',
            boxShadow: '0 6px 28px rgba(172, 36, 113, 0.38)',
            transform: 'translateY(-1px)',
          },
          '&:active:not(:disabled)': {
            transform: 'scale(0.97) translateY(0)',
          },
          '&:disabled': {
            opacity: '0.5',
            cursor:  'not-allowed',
          },
        },

        // ── Auth tab ──
        '.auth-tab': {
          color:        '#564149',
          cursor:       'pointer',
          borderRadius: '0.5rem',
          padding:      '0.5rem 0',
          fontSize:     '14px',
          fontWeight:   '500',
          transition:   'all 0.2s',
          border:       'none',
          background:   'transparent',
          '&.active': {
            background: '#ffffff',
            color:      '#ac2471',
            boxShadow:  '0 2px 8px rgba(0, 0, 0, 0.08)',
          },
        },

        // ── Message bubbles ──
        '.msg-wrapper': {
          display:  'flex',
          width:    '100%',
          animation:'fadeInUp 0.25s ease-out',
        },
        '.msg-wrapper.user':  { justifyContent: 'flex-end', paddingLeft:  '3rem' },
        '.msg-wrapper.model': { justifyContent: 'flex-start', paddingRight: '0.75rem' },

        '.bubble': {
          maxWidth:     '100%',
          borderRadius: '1.25rem',
          padding:      '0.75rem 1rem',
          fontSize:     '16px',
          lineHeight:   '1.5',
          wordBreak:    'break-word',
        },
        '.user-bubble': {
          background:  'linear-gradient(135deg, #ac2471, #7212ff)',
          color:       '#ffffff',
          borderRadius:'1.25rem 1.25rem 0.25rem 1.25rem',
          boxShadow:   '0 4px 14px rgba(114, 18, 255, 0.25)',
        },
        '.model-bubble': {
          background:               'rgba(255, 255, 255, 0.94)',
          backdropFilter:           'blur(12px)',
          '-webkit-backdrop-filter':'blur(12px)',
          border:                   '1px solid rgba(255, 255, 255, 0.55)',
          color:                    '#1c1b1b',
          borderRadius:             '1.25rem 1.25rem 1.25rem 0.25rem',
          boxShadow:                '0 4px 12px rgba(0, 0, 0, 0.06)',
        },

        // ── Typing indicator ──
        '.typing-bubble': {
          display:                  'flex',
          gap:                      '5px',
          alignItems:               'center',
          padding:                  '0.75rem 1rem',
          borderRadius:             '1.25rem 1.25rem 1.25rem 0.25rem',
          background:               'rgba(255, 255, 255, 0.82)',
          backdropFilter:           'blur(12px)',
          '-webkit-backdrop-filter':'blur(12px)',
          border:                   '1px solid rgba(255, 255, 255, 0.55)',
          boxShadow:                '0 2px 8px rgba(0, 0, 0, 0.05)',
        },
        '.typing-dot': {
          width:      '8px',
          height:     '8px',
          background: '#ac2471',
          borderRadius:'50%',
        },
        '.typing-dot:nth-child(1)': { animationDelay: '-0.32s' },
        '.typing-dot:nth-child(2)': { animationDelay: '-0.16s' },
        '.typing-dot:nth-child(3)': { animationDelay: '0s' },

        // ── Icon button ──
        '.icon-btn': {
          padding:       '0.5rem',
          borderRadius:  '0.5rem',
          border:        'none',
          background:    'transparent',
          color:         '#81515a',
          cursor:        'pointer',
          display:       'flex',
          alignItems:    'center',
          justifyContent:'center',
          transition:    'background 0.15s, color 0.15s',
          '&:hover': {
            background: 'rgba(253, 190, 201, 0.3)',
            color:      '#ac2471',
          },
        },
      });

      addUtilities({
        '.no-scrollbar::-webkit-scrollbar': { display: 'none' },
        '.no-scrollbar': { '-ms-overflow-style': 'none', 'scrollbar-width': 'none' },
      });
    }),
  ],
};
