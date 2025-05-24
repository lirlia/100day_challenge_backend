import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}', // pagesディレクトリがある場合
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}', // App Router用
  ],
  darkMode: "class", // or 'media' or 'class'
  theme: {
    extend: {
      colors: {
        'neumorphism-bg': '#e0e5ec', // Light mode background
        'neumorphism-bg-dark': '#2c3036', // Dark mode background (example)
        'neumorphism-text': '#5a6370', // Light mode text
        'neumorphism-text-dark': '#c0c8d4', // Dark mode text (example)
        'neumorphism-accent': '#4a76f5', // Accent color for titles, primary buttons
        'neumorphism-soft-text': '#8b95a2', // Softer text color for descriptions
        'neumorphism-border': '#d1d9e6', // Border color for light mode
      },
      boxShadow: {
        'neumorphism-concave': 'inset 5px 5px 10px #bec3c9, inset -5px -5px 10px #ffffff',
        'neumorphism-convex': '5px 5px 10px #bec3c9, -5px -5px 10px #ffffff',
        'neumorphism-soft': '7px 7px 15px #babecc, -7px -7px 15px #ffffff',
        'neumorphism-input': 'inset 2px 2px 5px #babecc, inset -3px -3px 7px #ffffff',
        // Dark mode shadows (example - adjust as needed)
        'neumorphism-concave-dark': 'inset 5px 5px 10px #23262b, inset -5px -5px 10px #353a41',
        'neumorphism-convex-dark': '5px 5px 10px #23262b, -5px -5px 10px #353a41',
        'neumorphism-soft-dark': '7px 7px 15px #23262b, -7px -7px 15px #353a41',
        'neumorphism-input-dark': 'inset 2px 2px 5px #23262b, inset -3px -3px 7px #353a41',
      },
      borderRadius: {
        'neumorphism': '15px',
      },
      // 必要に応じてテーマ拡張をここに追加
      // 例: backgroundImage from Day29 (もし必要なら)
      // backgroundImage: {
      //   'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      //   'gradient-conic':
      //     'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      // },
    },
  },
  plugins: [],
}
export default config
