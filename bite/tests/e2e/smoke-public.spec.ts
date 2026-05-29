import { test, expect } from "@playwright/test";

/**
 * 公开冒烟测试：不需要登录，验证首页 + 登录页能正常渲染。
 * baseURL 已在 playwright.config.ts 配置为生产域名。
 */
test.describe("public smoke", () => {
  test("landing page renders", async ({ page }) => {
    await page.goto("/");

    // 首页应能看到品牌名或主标语（中文 UI）
    await expect(
      page.getByText(/Bite|餐厅/i).first(),
    ).toBeVisible({ timeout: 15_000 });

    // 应有跳转到登录的入口（按钮或链接）
    const loginEntry = page
      .getByRole("link", { name: /登录|登入|Sign in|Log in/i })
      .or(page.getByRole("button", { name: /登录|登入|Sign in|Log in/i }))
      .first();
    await expect(loginEntry).toBeVisible({ timeout: 10_000 });
  });

  test("login page renders", async ({ page }) => {
    await page.goto("/login");

    const emailInput = page
      .getByLabel(/邮箱|Email/i)
      .or(page.getByPlaceholder(/邮箱|Email/i))
      .or(page.locator('input[type="email"]'))
      .first();
    await expect(emailInput).toBeVisible({ timeout: 10_000 });

    const passwordInput = page
      .getByLabel(/密码|Password/i)
      .or(page.getByPlaceholder(/密码|Password/i))
      .or(page.locator('input[type="password"]'))
      .first();
    await expect(passwordInput).toBeVisible({ timeout: 10_000 });
  });
});
