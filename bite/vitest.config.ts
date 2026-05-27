import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 纯函数单测。只测不碰 DB / 网络的业务逻辑（合并去重、输入路由等），
// 服务端 action 的 Supabase 部分不在这里覆盖。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    // 跟 tsconfig 的 "@/*" → "./src/*" 对齐
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
