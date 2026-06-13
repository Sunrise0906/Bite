import { defineConfig } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import * as path from "node:path";

// 手动加载 .env.local（避免新增 dotenv 依赖）
// 给 E2E 用：E2E_TEST_EMAIL / E2E_TEST_PASSWORD 等
// 注意：Playwright 1.60 的 TS loader 以 CJS 加载此文件（package.json 无 "type": "module"），
// 因此不能用 import.meta.url；改用 process.cwd()（npm script 启动时即 bite/）。
const envPath = path.resolve(process.cwd(), ".env.local");
if (existsSync(envPath)) {
  const raw = readFileSync(envPath, "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // 去掉可能包裹的引号
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 1,
  workers: 1,
  timeout: 60_000,
  reporter: "list",
  use: {
    // 默认打生产；本地测新代码时用 E2E_BASE_URL=http://localhost:3000 覆盖
    baseURL: process.env.E2E_BASE_URL || "https://bite-sand.vercel.app",
    headless: true,
    viewport: { width: 1280, height: 800 },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
});
