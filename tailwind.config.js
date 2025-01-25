import daisyui from "daisyui"
import typography from "@tailwindcss/typography"

export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  //...
  plugins: [
    typography,
    daisyui,
  ],
  daisyui: {
    themes: false,
  },
}