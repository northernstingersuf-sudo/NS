import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: { ink: "#0a0a0a", paper: "#ffffff", fog: "#f5f5f3", line: "#e6e6e3", mute: "#6b6b68" },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      keyframes: { ticker: { from: { transform: "translateX(0)" }, to: { transform: "translateX(-50%)" } } },
      animation: { ticker: "ticker 40s linear infinite" },
      letterSpacing: { tightest: "-0.04em" },
    },
  },
  plugins: [],
} satisfies Config;
