import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}", // app ディレクトリ内のファイルを対象に
    "./components/**/*.{js,ts,jsx,tsx,mdx}", // components ディレクトリ内のファイルを対象に (もしあれば)
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
export default config;
