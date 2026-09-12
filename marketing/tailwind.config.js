/** Tokens mirror the Figma "Style guide" frame (node 1:134873). */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Theme Colors
        accent: '#58D7C4',
        // Neutral ramp
        n1: '#FFFFFF',
        n2: '#D5D4D4',
        n3: '#6D6D6D',
        n4: '#151515',
        stroke: '#2B2B2B',
        ink: '#000000',
      },
      fontFamily: {
        // Headline/* tokens use Inter Tight; Body/* and Archivo headlines use Archivo.
        sans: ['Archivo', 'system-ui', 'sans-serif'],
        tight: ['"Inter Tight"', 'Archivo', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Headline scale — [size, { lineHeight, letterSpacing }]
        'display-h1': ['76px', { lineHeight: '1.15', letterSpacing: '-2px' }],
        h1: ['64px', { lineHeight: '1.15', letterSpacing: '-2px' }],
        h2: ['56px', { lineHeight: '1.2', letterSpacing: '-1.5px' }],
        'h2-sm': ['48px', { lineHeight: '1.2', letterSpacing: '-1.5px' }],
        h3: ['36px', { lineHeight: '1.4', letterSpacing: '-1px' }],
        h4: ['24px', { lineHeight: '1.4', letterSpacing: '-0.5px' }],
        // Body scale — all lineHeight 1.7
        'body-14': ['14px', { lineHeight: '1.7' }],
        'body-16': ['16px', { lineHeight: '1.7' }],
        'body-18': ['18px', { lineHeight: '1.7' }],
        'body-20': ['20px', { lineHeight: '1.7' }],
      },
      borderRadius: { pill: '62px', nav: '88px' },
      maxWidth: { shell: '1240px', page: '1440px' },
    },
  },
  plugins: [],
};
