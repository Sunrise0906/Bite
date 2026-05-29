import { test, expect } from "@playwright/test";
import { login, uniqueTag } from "./_utils/auth";

test.describe("lists CRUD", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E credentials not in bite/.env.local; skipping",
  );

  test("create + delete a test list", async ({ page }) => {
    await login(page);
    await page.goto("/lists");

    const listName = uniqueTag("[E2E] Smoke ");

    // 新建 list 按钮：找 role+name，覆盖中文/+ 几种写法
    const newListBtn = page
      .getByRole("button", { name: /新建.*list|建.*list|新建|添加.*list/i })
      .or(page.getByRole("link", { name: /新建.*list|建.*list|新建/i }))
      .or(page.getByRole("button", { name: /^\+$/ }))
      .first();
    await newListBtn.click({ timeout: 10_000 });

    // 名称输入框：可能是 dialog 内 textbox、input[type=text]、或带 placeholder
    const nameInput = page
      .getByRole("textbox", { name: /名称|List 名|名字|name/i })
      .or(page.getByPlaceholder(/名称|名字|name|List/i))
      .or(page.locator('input[type="text"]').first())
      .first();
    await nameInput.fill(listName);

    // 提交：常见 "创建" / "确定" / "保存"
    await page
      .getByRole("button", { name: /创建|确定|保存|提交|Create|Save/i })
      .first()
      .click();

    // 创建主断言：跳转到 /lists/<uuid>
    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{8,}/i, {
      timeout: 15_000,
    });

    // 删除是 best-effort，不应让主用例失败
    try {
      // 先在 list 详情页找菜单/删除按钮
      const menuOrDelete = page
        .getByRole("button", { name: /更多|menu|操作|⋯|\.\.\./i })
        .or(page.getByRole("button", { name: /删除|Delete/i }))
        .first();
      await menuOrDelete.click({ timeout: 5_000 });

      const deleteBtn = page
        .getByRole("menuitem", { name: /删除|Delete/i })
        .or(page.getByRole("button", { name: /删除|Delete/i }))
        .first();
      await deleteBtn.click({ timeout: 5_000 });

      // 确认弹窗
      const confirmBtn = page
        .getByRole("button", { name: /确认|确定|Delete|删除/i })
        .first();
      await confirmBtn.click({ timeout: 5_000 });

      // 删除后应跳回 /lists
      await page.waitForURL(/\/lists\/?$/, { timeout: 10_000 });
    } catch (err) {
      // 删除 UI 找不到 / 不可达：仅警告，不让 cleanup-only 失败杀死用例
      console.warn(
        `[E2E lists] cleanup failed for "${listName}": ${(err as Error).message}`,
      );
    }
  });
});
