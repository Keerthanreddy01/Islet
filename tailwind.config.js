/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        island: {
          bg: "#08080a",
          subtle: "#121418",
          pill: "#1a1c22",
          border: "#1e1e22",
        },
        accent: {
          blue: "#0a84ff",
          green: "#34c759",
          orange: "#ff9500",
        }
      },
      fontFamily: {
        system: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI Variable Text",
          "Segoe UI",
          "system-ui",
          "sans-serif"
        ]
      }
    },
  },
  plugins: [],
}
