/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        // Indigo stays as the cool primary, but is now paired with a
        // warm copper accent so the palette has tension instead of a
        // single timid hue.
        accent: { DEFAULT: "#4f46e5", light: "#818cf8", muted: "#312e81" },
        ember: {
          50:  "#fdf6ef",
          100: "#faead8",
          200: "#f4d0a6",
          300: "#ecb074",
          400: "#e2904a",
          500: "#d77437",   // signature warm punctuation
          600: "#b85a26",
          700: "#92451f",
          800: "#6b321a",
          900: "#3f1d12",
        },
        ink: {
          50:  "#f6f5f2",   // warm off-white (paper, not bleach)
          100: "#ecebe5",
          200: "#d9d7cc",
          300: "#b8b4a6",
          400: "#8c8779",
          500: "#5e5a4f",
          600: "#3d3b34",
          700: "#262521",
          800: "#171614",
          900: "#0d0c0b",   // warm off-black (not pure #000)
        },
      },
      boxShadow: {
        glow: "0 0 40px rgba(99,102,241,0.18)",
        ember: "0 0 32px rgba(215,116,55,0.22)",
        card: "var(--shadow-card)",
      },
      backgroundImage: {
        grid: "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
        noise:
          "url(\"data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
      },
    },
  },
  plugins: [],
};
