/** Tailwind config — compiled to a static CSS that build.js inlines into
 *  index.html (so there is NO runtime CDN / JIT: the app is 100% offline).
 *  All utility classes are authored literally in src/app.jsx, so a content
 *  scan captures them; the safelist guarantees the custom neon palette. */
module.exports = {
  content: ['./src/app.jsx'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: { neon: { cyan: '#22d3ee', green: '#34d399', amber: '#fbbf24', red: '#f87171', violet: '#a78bfa' } },
      fontFamily: { mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'] },
    },
  },
  safelist: [{ pattern: /(bg|text|fill|stroke|border)-neon-(cyan|green|amber|red|violet)/ }],
};
