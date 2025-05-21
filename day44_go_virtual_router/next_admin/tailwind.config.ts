import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}', // pagesディレクトリがある場合
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}', // App Router用
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      // 必要に応じてニューモーフィズム用のシャドウやカラーをthemeに定義できます
    },
  },
  plugins: [
    require('./my-neumorphism-plugin.js'), // 作成したプラグインを読み込む
  ],
}
export default config
