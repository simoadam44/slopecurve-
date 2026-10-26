/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0B1020",
        card: "#131B2E",
        border: "#26334B",
        primary: "#7C5CFC",
        secondary: "#31C7D5",
        ink: "#F5F7FF",
        muted: "#A8B2C5",
      },
    },
  },
  plugins: [],
};
