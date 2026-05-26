/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#212121",
          sidebar: "#171717",
          input: "#2f2f2f",
          hover: "#2a2a2a",
          msg: "#2f2f2f",
        },
        accent: "#10a37f",
      },
    },
  },
  plugins: [],
};
