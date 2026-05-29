import { test, expect } from "@playwright/test";
import { login, uniqueTag } from "./_utils/auth";
import { createTestList, deleteTestList } from "./_utils/lists";

/**
 * 回归：commit 9c1b98e —— /quick-add 点 autocomplete 建议后，
 * 确认页应能成功拉取 Google Place Details（修复 Places API referer/403）。
 *
 * 关键路由细节（见 src/app/(app)/lists/page.tsx line 98）：
 * - QuickAddInput（含 Google Places autocomplete）**只**挂载在 /lists 索引页。
 * - /lists/<id>/places/new 用的是 PlaceForm 手动创建表单，没有 autocomplete。
 * - 所以这个流程必须从 /lists 开始，**不能**从 /lists/<id> 开始。
 *
 * 流程（与 src/components/places/quick-add-input.tsx 对齐）：
 * 1. login → 已自动落地 /lists（或先 createTestList，会落到 /lists/<id>）
 * 2. goto /lists 找到 textarea[name=text]
 * 3. type 一个店名（>= 2 chars，detectInputType 必须判为 'place_name'）
 * 4. 等 250ms debounce + Google Places fetch → <ul> 出现
 * 5. 点第一个 suggestion <button> → router.push 到 /quick-add?placeId=...
 * 6. server component 调 getPlaceDetails → 渲染 <h1>确认店铺信息</h1>
 * 7. 断言 NO error 文案（这是回归 commit 9c1b98e 的重点）
 */
test.describe("quick-add places", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E credentials not in bite/.env.local; skipping",
  );
  test.skip(
    !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
    "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set; QuickAddInput shows warning text instead of suggestions",
  );

  let createdListId: string | null = null;
  const listName = uniqueTag("[E2E] Smoke ");

  test("Place Details fetch works on confirm page", async ({ page }) => {
    await login(page);

    // ---- 准备：创建一个 [E2E] list（quick-add 流程需要至少一个可写 list 才能进确认页）----
    createdListId = await createTestList(page, listName);

    // ---- 进入 /lists（QuickAddInput 唯一挂载点）----
    await page.goto("/lists");

    // 关键 selector：唯一的 <textarea name="text">
    // placeholder = "粘贴小红书正文、写几句话、或搜店名…"
    const searchInput = page
      .getByPlaceholder(/粘贴小红书正文|搜店名/)
      .or(page.locator('textarea[name="text"]'))
      .first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });

    // 浏览器可能弹 geolocation 权限：组件 5s 内 fallback 到 Irvine，不阻塞 autocomplete
    await searchInput.click();
    await searchInput.fill("starbucks");

    // ---- 等 autocomplete 出现 ----
    // 没有 role="listbox"；就是普通 <ul class="overflow-hidden..."><li><button>
    // 中间可能短暂出现 "搜索中…"（250ms debounce + Google 响应），最多给 8s
    const suggestionList = page.locator("ul.overflow-hidden").first();
    const firstSuggestion = suggestionList.locator("li button").first();
    await expect(firstSuggestion).toBeVisible({ timeout: 8_000 });

    // ---- 点击第一个 suggestion → router.push 到 /quick-add?placeId=...&sessionToken=... ----
    await firstSuggestion.click();
    await page.waitForURL(/\/quick-add\?placeId=/, { timeout: 10_000 });

    // ---- 主断言：确认店铺信息页渲染 ----
    await expect(
      page.getByRole("heading", { name: "确认店铺信息" }),
    ).toBeVisible({ timeout: 20_000 });

    // ---- 回归断言：不应出现 Places API 报错 ----
    const errorLocator = page.getByText(
      /拉取 Google Places 详情失败|PERMISSION_DENIED|Requests from referer|403/i,
    );
    await expect(errorLocator).toHaveCount(0);

    // ---- 不保存，直接走 "取消并返回" 链接 ----
    const cancelLink = page
      .getByRole("link", { name: /取消并返回/ })
      .first();
    if (await cancelLink.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await cancelLink.click().catch(() => {});
    }
  });

  test.afterAll(async ({ browser }) => {
    // 删除测试 list，best-effort
    if (!createdListId) return;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    try {
      await login(page);
      await deleteTestList(page, createdListId);
    } finally {
      await ctx.close();
    }
  });
});
