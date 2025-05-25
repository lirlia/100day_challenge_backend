/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // './pages/**/*.{js,ts,jsx,tsx,mdx}', // pages ディレクトリがない場合はコメントアウト
  ],
  theme: {
    extend: {
      // 全て空にする
    },
  },
  plugins: [],
};
