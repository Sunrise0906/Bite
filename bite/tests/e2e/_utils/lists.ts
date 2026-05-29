import { expect, type Page } from "@playwright/test";

/**
 * 在 /lists 创建一个测试 list，并返回新建 list 的 id。
 *
 * 实现细节（与 /lists 当前 UI 对齐）：
 * - /lists 顶部有一个 inline 表单：placeholder 为 "新建 list，例如 …" 的 textbox
 *   + 同一个标记为 "新建" 的提交按钮。**没有**单独的 reveal 步骤。
 * - 之前的测试用 /创建|确定|保存|提交|Create|Save/i 匹配提交按钮，漏了 "新建"
 *   导致 60s 超时。这里直接 fill + 点 "新建"。
 */
export async function createTestList(page: Page, name: string): Promise<string> {
  await page.goto("/lists");

  // 名称输入框：当前实现 placeholder = "新建 list，例如 "Irvine 想吃的""
  const nameInput = page
    .getByPlaceholder(/新建 list/i)
    .or(page.getByRole("textbox", { name: /名称|名字|List|name/i }))
    .or(page.locator('input[name="name"]').first())
    .first();
  await expect(nameInput).toBeVisible({ timeout: 10_000 });
  await nameInput.fill(name);

  // 提交按钮：精确匹配 "新建"（pending 时会变成 "创建中…"，也兼容一下）
  const submitBtn = page
    .getByRole("button", { name: /^新建$|^创建$|Create|Save/i })
    .first();
  await submitBtn.click({ timeout: 10_000 });

  // 创建成功后路由跳到 /lists/<uuid>
  await page.waitForURL(/\/lists\/[0-9a-f-]{8,}/i, { timeout: 15_000 });

  const match = page.url().match(/\/lists\/([0-9a-f-]{8,})/i);
  if (!match) {
    throw new Error(`createTestList: 无法从 URL 解析 list id：${page.url()}`);
  }
  return match[1];
}

/**
 * 删除测试 list — best-effort，不抛错。
 * 用于 cleanup，UI 文案/路径变了也不应让主用例失败。
 */
export async function deleteTestList(page: Page, id: string): Promise<void> {
  try {
    await page.goto(`/lists/${id}`);

    const menuBtn = page
      .getByRole("button", { name: /list 操作菜单|更多|menu|操作|⋯|\.\.\./i })
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

    await page.waitForURL(/\/lists\/?(\?.*)?$/, { timeout: 10_000 });
  } catch (err) {
    console.warn(
      `[E2E] deleteTestList(${id}) cleanup failed: ${(err as Error).message}`,
    );
  }
}
