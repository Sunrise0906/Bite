import { test, expect, type Browser, type Page } from "@playwright/test";
import { login, uniqueTag } from "./_utils/auth";
import { createTestList, deleteTestList } from "./_utils/lists";

/**
 * Invite 共享流回归测试。
 *
 * 背景：acceptListInvite 曾被 list_members 的 owner-only insert policy 拒死
 * （修复见 sql/0010_list_members_policies.sql）。完整接受流需要第二个测试账号：
 * 在 bite/.env.local 配 E2E_TEST_EMAIL_2 / E2E_TEST_PASSWORD_2 后自动启用。
 */

/** owner 在 list 页生成邀请链接并返回 URL */
async function createInviteLink(page: Page, listId: string): Promise<string> {
  await page.goto(`/lists/${listId}`);

  await page.getByRole("button", { name: /\+?\s*邀请/ }).first().click();
  // modal 默认角色 co_owner，直接生成
  await page.getByRole("button", { name: /生成链接/ }).click();

  // ready 态：readonly input 的 value 就是邀请 URL
  const urlInput = page.locator('input[readonly]').first();
  await expect(urlInput).toBeVisible({ timeout: 15_000 });
  const url = await urlInput.inputValue();
  expect(url).toMatch(/\/invite\/[0-9a-f-]{8,}/i);

  // 关掉 modal，避免遮挡后续操作
  await page.getByRole("button", { name: /^关闭$/ }).click();
  return url;
}

test.describe("invite 共享流", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E credentials not in bite/.env.local; skipping",
  );

  test("owner 生成邀请链接 + 预览页渲染（own-invite 分支）", async ({ page }) => {
    await login(page);
    const listId = await createTestList(page, uniqueTag("[E2E] Invite "));

    try {
      const inviteUrl = await createInviteLink(page, listId);

      // owner 自己访问邀请页 → 命中"自己创建"分支，而不是报错/无效
      await page.goto(inviteUrl);
      await expect(
        page.getByText(/这是你自己创建的邀请/),
      ).toBeVisible({ timeout: 10_000 });
    } finally {
      await deleteTestList(page, listId);
    }
  });

  test("受邀者接受邀请后成为成员（需第二账号 + sql/0010）", async ({
    page,
    browser,
  }) => {
    const email2 = process.env.E2E_TEST_EMAIL_2;
    const password2 = process.env.E2E_TEST_PASSWORD_2;
    test.skip(
      !email2 || !password2,
      "E2E_TEST_EMAIL_2/PASSWORD_2 not set; skipping full accept flow",
    );

    await login(page);
    const listName = uniqueTag("[E2E] InviteAccept ");
    const listId = await createTestList(page, listName);

    try {
      const inviteUrl = await createInviteLink(page, listId);

      // 受邀者用独立 browser context（独立 cookie / session）
      const inviteePage = await newLoggedInPage(browser, email2!, password2!);
      try {
        await inviteePage.goto(inviteUrl);

        // 邀请预览：显示 list 名 + 接受按钮
        await expect(inviteePage.getByText(listName)).toBeVisible({
          timeout: 10_000,
        });
        await inviteePage
          .getByRole("button", { name: /加入|接受/ })
          .first()
          .click();

        // 接受成功 → 跳到该 list 详情页。
        // 若这里报「加入失败：new row violates row-level security policy」
        // 说明 sql/0010_list_members_policies.sql 还没在 Supabase 跑。
        await inviteePage.waitForURL(new RegExp(`/lists/${listId}`, "i"), {
          timeout: 15_000,
        });
        await expect(inviteePage.getByText(listName).first()).toBeVisible();
      } finally {
        await inviteePage.context().close();
      }
    } finally {
      // owner 删 list，级联清掉 list_members / list_invites
      await deleteTestList(page, listId);
    }
  });
});

async function newLoggedInPage(
  browser: Browser,
  email: string,
  password: string,
): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page, { email, password });
  return page;
}
