import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      boxShadow: {
        glow: "0 0 32px rgba(80, 220, 255, 0.28)",
        soft: "0 18px 60px rgba(51, 70, 130, 0.16)"
      }
    }
  },
  plugins: []
};

export default config;
