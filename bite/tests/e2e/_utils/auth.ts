import type { Page } from "@playwright/test";

/**
 * E2E 登录辅助：使用 E2E_TEST_EMAIL / E2E_TEST_PASSWORD（放在 bite/.env.local）。
 * 文案优先匹配中文（项目 UI 全中文），同时兼容英文以防回归。
 */
export async function login(page: Page): Promise<void> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Set E2E_TEST_EMAIL+PASSWORD in bite/.env.local",
    );
  }

  await page.goto("/login");

  // 邮箱：优先 label/placeholder（中文），退回 type 选择器
  const emailInput = page
    .getByLabel(/邮箱|Email/i)
    .or(page.getByPlaceholder(/邮箱|Email/i))
    .or(page.locator('input[type="email"]'))
    .first();
  await emailInput.fill(email);

  // 密码
  const passwordInput = page
    .getByLabel(/密码|Password/i)
    .or(page.getByPlaceholder(/密码|Password/i))
    .or(page.locator('input[type="password"]'))
    .first();
  await passwordInput.fill(password);

  // 提交按钮
  await page
    .getByRole("button", { name: /登录|Sign in/i })
    .first()
    .click();

  // 登录成功后跳转到 /lists 或 /
  await page.waitForURL(/\/(lists)?(\?.*)?$/, { timeout: 15_000 });
}

/**
 * 生成测试期间唯一的 tag，避免多次运行串扰。
 * 注意：Date.now / Math.random 在测试运行时执行，是可接受的。
 */
export function uniqueTag(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}
