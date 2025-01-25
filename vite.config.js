import { defineConfig } from 'vite'
import viteCompression from 'vite-plugin-compression';
import tailwindcss from '@tailwindcss/vite'
export default defineConfig({
  // resolve: {
  //   alias: {
  //     '@node_modules': '../node_modules',
  //     '@script': '../script'
  //   }
  // },
  plugins: [
    tailwindcss(),
    viteCompression({
      verbose: true, 
      disable: false, 
      deleteOriginFile: false, 
      threshold: 5120, 
      algorithm: "gzip",
      ext: ".gz", 
    }),
  ],

  server: {
    open: true,
    host: '0.0.0.0'
  },
  build: {
    target: 'esnext' // 设置为esnext，它会包含最新的ECMAScript特性，包括顶层await
  }

})

