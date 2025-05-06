import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      boxShadow: {
        // Define neumorphic shadows
        'neumorphic': '5px 5px 10px #bebebe, -5px -5px 10px #ffffff',
        'neumorphic-inset': 'inset 5px 5px 10px #bebebe, inset -5px -5px 10px #ffffff',
        'neumorphic-sm': '3px 3px 6px #bebebe, -3px -3px 6px #ffffff',
        'neumorphic-sm-inset': 'inset 3px 3px 6px #bebebe, inset -3px -3px 6px #ffffff',
      },
      colors: {
        // Define base colors suitable for neumorphism
        'neumorphic-base': '#e0e0e0', // Example base color
        'neumorphic-highlight': '#ffffff',
        'neumorphic-shadow': '#bebebe',
      },
    },
  },
  plugins: [],
};
export default config;
