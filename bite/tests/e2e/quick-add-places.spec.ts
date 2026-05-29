import { test, expect } from "@playwright/test";
import { login, uniqueTag } from "./_utils/auth";

/**
 * 回归：commit 9c1b98e —— /quick-add 点 autocomplete 建议后，
 * 确认页应能成功拉取 Google Place Details（修复 Places API referer/403）。
 */
test.describe("quick-add places", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E credentials not in bite/.env.local; skipping",
  );

  let createdListUrl: string | null = null;
  const listName = uniqueTag("[E2E] Smoke ");

  test("Place Details fetch works on confirm page", async ({ page }) => {
    await login(page);

    // ---- 准备：创建一个 [E2E] list，从 URL 捕获 id ----
    await page.goto("/lists");

    const newListBtn = page
      .getByRole("button", { name: /新建.*list|建.*list|新建|添加.*list/i })
      .or(page.getByRole("link", { name: /新建.*list|建.*list|新建/i }))
      .or(page.getByRole("button", { name: /^\+$/ }))
      .first();
    await newListBtn.click({ timeout: 10_000 });

    const nameInput = page
      .getByRole("textbox", { name: /名称|名字|name/i })
      .or(page.getByPlaceholder(/名称|名字|name|List/i))
      .or(page.locator('input[type="text"]').first())
      .first();
    await nameInput.fill(listName);

    await page
      .getByRole("button", { name: /创建|确定|保存|提交|Create|Save/i })
      .first()
      .click();

    await expect(page).toHaveURL(/\/lists\/[0-9a-f-]{8,}/i, {
      timeout: 15_000,
    });
    createdListUrl = page.url();

    // ---- 进入 quick-add ----
    await page.goto("/quick-add");

    // 若需要先选 list,则选刚才那个 [E2E] list
    const listPicker = page.getByText(listName, { exact: false }).first();
    if (await listPicker.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await listPicker.click();
    }

    // 主搜索框：输 'starbucks'
    const searchInput = page
      .getByRole("textbox", { name: /搜索|店铺|名称|name/i })
      .or(page.getByPlaceholder(/搜索|店铺|餐厅|name|search/i))
      .or(page.locator('input[type="text"]').first())
      .first();
    await searchInput.fill("starbucks");

    // 等 autocomplete 出现：listbox / option / 包含 starbucks 的可点击项
    const suggestion = page
      .getByRole("option")
      .or(page.locator('[role="listbox"] >> *'))
      .or(page.getByText(/starbucks/i))
      .first();
    await expect(suggestion).toBeVisible({ timeout: 15_000 });
    await suggestion.click();

    // ---- 主断言：确认店铺信息页渲染 ----
    await expect(
      page.getByText("确认店铺信息"),
    ).toBeVisible({ timeout: 20_000 });

    // ---- 回归断言:不应出现 Places API 报错 ----
    const errorLocator = page.getByText(
      /拉取 Google Places 详情失败|PERMISSION_DENIED|Requests from referer|403/i,
    );
    await expect(errorLocator).toHaveCount(0);

    // ---- 不保存，取消返回 ----
    const cancelBtn = page
      .getByRole("button", { name: /取消|返回|关闭|Cancel/i })
      .first();
    if (await cancelBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cancelBtn.click().catch(() => {});
    }
  });

  test.afterAll(async ({ browser }) => {
    // 删除测试 list，best-effort
    if (!createdListUrl) return;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page);
      await page.goto(createdListUrl);

      const menuBtn = page
        .getByRole("button", { name: /更多|menu|操作|⋯|\.\.\./i })
        .first();
      await menuBtn.click({ timeout: 5_000 });

      const deleteBtn = page
        .getByRole("menuitem", { name: /删除|Delete/i })
        .or(page.getByRole("button", { name: /删除|Delete/i }))
        .first();
      await deleteBtn.click({ timeout: 5_000 });

      const confirmBtn = page
        .getByRole("button", { name: /确认|确定|Delete|删除/i })
        .first();
      await confirmBtn.click({ timeout: 5_000 });
    } catch (err) {
      console.warn(
        `[E2E quick-add] cleanup failed for "${listName}": ${(err as Error).message}`,
      );
    } finally {
      await ctx.close();
    }
  });
});
