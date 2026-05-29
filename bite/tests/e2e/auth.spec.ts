import { test, expect } from "@playwright/test";
import { login } from "./_utils/auth";

test.describe("auth", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E credentials not in bite/.env.local; skipping",
  );

  test("email/password login lands on /lists", async ({ page }) => {
    await login(page);

    // login() 内部已 waitForURL 到 /lists 或 /；这里再断言一次最终落在 /lists
    await page.goto("/lists");
    await expect(page).toHaveURL(/\/lists/);

    // /lists 页面应有一个可识别的元素：标题、"新建" 按钮、空状态文案等
    const indicator = page
      .getByRole("heading", { name: /我的 ?list|List|清单/i })
      .or(page.getByRole("button", { name: /新建|建.*list|\+/i }))
      .or(page.getByText(/还没有|暂无|没有.*list/i))
      .first();
    await expect(indicator).toBeVisible({ timeout: 15_000 });
  });
});
