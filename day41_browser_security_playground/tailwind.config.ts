import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class', // ダークモードをクラスで制御
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}', // pagesディレクトリがある場合
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}', // App Router用
  ],
  theme: {
    extend: {
      // 必要に応じてテーマ拡張をここに追加
      // 例: backgroundImage from Day29 (もし必要なら)
      // backgroundImage: {
      //   'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
      //   'gradient-conic':
      //     'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      // },
      // グラスモーフィズムのための設定 (必要であれば)
      backdropBlur: {
        xs: '2px',
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
      }
    },
  },
  plugins: [],
}
export default config
