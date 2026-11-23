const path = require('node:path');
const v = (n) => `rgb(var(--${n}) / <alpha-value>)`;
module.exports = {
  content: [path.join(__dirname, 'index.html'), path.join(__dirname, 'src/**/*.{js,jsx}')],
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        page: v('page'), card: v('card'), card2: v('card2'), ink: v('ink'), ink2: v('ink2'), muted: v('muted'), line: v('line'),
        up: v('up'), down: v('down'), flat: v('flat'), brand: v('brand'), warn: v('warn'), serious: v('serious'),
      },
      fontFamily: { sans: ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'] },
      borderRadius: { xl2: '1.25rem' },
    },
  },
  plugins: [],
};
