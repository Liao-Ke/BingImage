import { defineConfig } from "vite";

/**
 * 构建配置
 * inlineDynamicImports：将 import.meta.glob 懒加载的全部单日数据 JSON 内联进主 bundle，
 * 产物只有 index.html + assets 两个文件，部署自包含；数据总量约 700KB（gzip ~150KB），
 * 代价是首屏体积增大，换来运行时零按需请求。dev 模式不受影响，仍按需加载。
 */
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
