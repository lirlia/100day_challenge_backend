import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}', // pagesディレクトリがある場合
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}', // App Router用
  ],
  theme: {
    extend: {
      colors: {
        'neon-pink': '#FF00FF',
        'neon-blue': '#00FFFF',
        'neon-green': '#00FF00',
        'neon-purple': '#7F00FF',
        'dark-bg': '#1a1a2e', // 深い紺色のような背景
        'light-text': '#e0e0e0', // 明るいテキスト色
      },
      fontFamily: {
        'orbitron': ['Orbitron', 'sans-serif'], // ネオン/SF風フォント
      },
      boxShadow: {
        'neon-glow-pink': '0 0 5px #FF00FF, 0 0 10px #FF00FF, 0 0 15px #FF00FF, 0 0 20px #FF00FF',
        'neon-glow-blue': '0 0 5px #00FFFF, 0 0 10px #00FFFF, 0 0 15px #00FFFF, 0 0 20px #00FFFF',
        'neon-glow-green': '0 0 5px #00FF00, 0 0 10px #00FF00, 0 0 15px #00FF00, 0 0 20px #00FF00',
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
