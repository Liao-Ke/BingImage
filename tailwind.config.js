/** @type {import('tailwindcss').Config} */
import daisyui from "daisyui"
// import typography from "@tailwindcss/typography"

export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  //...
  plugins: [
    daisyui,
  ],
  daisyui: {
    themes: false,
  },
}