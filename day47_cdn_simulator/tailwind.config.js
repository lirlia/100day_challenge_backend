/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // './pages/**/*.{js,ts,jsx,tsx,mdx}', // pages ディレクトリがない場合はコメントアウト
  ],
  theme: {
    extend: {
      boxShadow: {
        'neumorphism-soft': '8px 8px 16px #bcc2ce, -8px -8px 16px #ffffff',
        'neumorphism-convex': '4px 4px 8px #bcc2ce, -4px -4px 8px #ffffff',
        'neumorphism-concave': 'inset 4px 4px 8px #bcc2ce, inset -4px -4px 8px #ffffff',
        'neumorphism-inner': 'inset 2px 2px 6px #bcc2ce, inset -2px -2px 6px #ffffff',
        'neumorphism-input': '2px 2px 6px #bcc2ce, -2px -2px 6px #ffffff',
        // dark mode
        'neumorphism-soft-dark': '8px 8px 16px #23262b, -8px -8px 16px #353a40',
        'neumorphism-convex-dark': '4px 4px 8px #23262b, -4px -4px 8px #353a40',
        'neumorphism-concave-dark': 'inset 4px 4px 8px #23262b, inset -4px -4px 8px #353a40',
        'neumorphism-inner-dark': 'inset 2px 2px 6px #23262b, inset -2px -2px 6px #353a40',
        'neumorphism-input-dark': '2px 2px 6px #23262b, -2px -2px 6px #353a40',
      },
      borderRadius: {
        'neumorphism': '1.5rem',
      },
      colors: {
        'neumorphism-bg': 'var(--neumorphism-bg-color)',
        'neumorphism-bg-dark': 'var(--neumorphism-bg-dark-color)',
        'neumorphism-text': 'var(--neumorphism-text-color)',
        'neumorphism-text-dark': 'var(--neumorphism-text-dark-color)',
        'neumorphism-accent': '#6c63ff',
        'neumorphism-soft-text': '#8b95a2',
        'neumorphism-border': '#d1d9e6',
      },
    },
  },
  plugins: [],
};
