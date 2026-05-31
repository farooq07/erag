/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        base: "#000000",
        surface: { DEFAULT: "#0d0d0d", card: "#111111", border: "#1a1a1a", hover: "#161616" },
        accent: { DEFAULT: "#4f46e5", light: "#818cf8", muted: "#312e81" },
        muted: "#6b7280",
      },
      boxShadow: {
        glow: "0 0 40px rgba(99,102,241,0.15)",
        card: "0 1px 3px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)",
      },
    },
  },
  plugins: [],
};
