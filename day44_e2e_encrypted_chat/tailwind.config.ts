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
        'neumo-bg': '#e0e0e0', // ベースの背景色 (明るいグレー)
        'neumo-highlight': '#ffffff', // ハイライト色
        'neumo-shadow-light': '#bababa', // 明るい影
        'neumo-shadow-dark': '#a3a3a3',  // 暗い影 (よりコントラストを出すため少し濃く)
        'neumo-text': '#757575', // テキストカラー
        'neumo-accent': '#6d28d9', // アクセントカラー (例: 紫)
      },
      boxShadow: {
        'neumo-inset': 'inset 6px 6px 12px #bababa, inset -6px -6px 12px #ffffff',
        'neumo-outset': '6px 6px 12px #a3a3a3, -6px -6px 12px #ffffff',
        'neumo-outset-sm': '3px 3px 6px #a3a3a3, -3px -3px 6px #ffffff',
        'neumo-pressed': 'inset 3px 3px 6px #bababa, inset -3px -3px 6px #ffffff',
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
}
export default config
