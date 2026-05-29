import { test, expect } from "@playwright/test";
import { login, uniqueTag } from "./_utils/auth";
import { createTestList, deleteTestList } from "./_utils/lists";

test.describe("lists CRUD", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E credentials not in bite/.env.local; skipping",
  );

  test("create + delete a test list", async ({ page }) => {
    await login(page);

    const listName = uniqueTag("[E2E] Smoke ");

    // 创建 list（helper 内部处理 inline-form 的 "新建" 按钮歧义）
    const listId = await createTestList(page, listName);

    // 主断言：跳转到 /lists/<uuid>
    await expect(page).toHaveURL(new RegExp(`/lists/${listId}`, "i"));

    // 清理：best-effort，不让 cleanup 失败杀死用例
    await deleteTestList(page, listId);
  });
});
