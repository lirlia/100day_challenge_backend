import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Blue Crystal Cave カラーパレット
        'brand-blue': '#3b8ecf', // 標準的な青
        'brand-blue-dark': '#1f6c9d', // 深い青
        'brand-black': '#0e3a54', // 最も暗い青/紺色
        'brand-dark-gray': '#154663', // 非常に暗い青
        'brand-light-gray': '#6db3d6', // 中間の青色
        'brand-extra-light-gray': '#a7d8e7', // 薄い水色
        'brand-bg': '#f5f9fc', // 既存の背景色に近い非常に薄い青
        'brand-highlight': '#e1f0f7', // 薄い水色を少し薄くしたもの
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
};

export default config;
