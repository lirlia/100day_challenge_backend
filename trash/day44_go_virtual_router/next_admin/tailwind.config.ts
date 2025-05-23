import type { Config } from 'tailwindcss';

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
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      boxShadow: {
        'neu-button': '5px 5px 10px #1f2937, -5px -5px 10px #374151',
        'neu-button-inset': 'inset 5px 5px 10px #1f2937, inset -5px -5px 10px #374151',
        'neu-input': 'inset 3px 3px 7px #1f2937, inset -3px -3px 7px #374151',
        'neu-input-focus': 'inset 3px 3px 7px #1f2937, inset -3px -3px 7px #374151, 0 0 0 2px #0ea5e9', // sky-500
      },
    },
  },
  plugins: [
    // require('./my-neumorphism-plugin.js'), // プラグインは今回は使用しない
  ],
};
export default config;
