import { test, expect } from "@playwright/test";
import { login } from "./_utils/auth";

/**
 * 回归：commit 3bd8c15 —— chat 工具返回 status 数组导致 invalid input value 报错。
 * 这里发一个无需真实数据的问题，验证助手回复正常、不含工具错误。
 */
test.describe("chat", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E credentials not in bite/.env.local; skipping",
  );

  test("chat answers without tool error", async ({ page }) => {
    test.setTimeout(90_000);

    await login(page);
    await page.goto("/chat");

    // 找输入框：textarea / textbox / placeholder 含"问"/"消息"
    const input = page
      .getByRole("textbox", { name: /消息|输入|问|chat|message/i })
      .or(page.getByPlaceholder(/输入|消息|问|chat|message|发送/i))
      .or(page.locator("textarea").first())
      .first();
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill("今晚吃啥");

    // 发送：优先按钮，回落到 Enter
    const sendBtn = page
      .getByRole("button", { name: /发送|提交|Send|submit/i })
      .first();
    if (await sendBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await sendBtn.click();
    } else {
      await input.press("Enter");
    }

    // 等助手回复出现：找一段足够长的文本块（不是用户自己的消息）
    // 最多等 45s 让 SSE 流式输出完成首段
    const assistantBubble = page
      .locator('[data-role="assistant"], [data-message-role="assistant"]')
      .or(page.getByText(/.{15,}/).filter({ hasNotText: "今晚吃啥" }))
      .first();
    await expect(assistantBubble).toBeVisible({ timeout: 45_000 });

    // 给 SSE 一点时间继续吐字
    await page.waitForTimeout(3_000);

    // 主回归断言：不应出现工具/查询/参数错误
    const errorLocator = page.getByText(
      /查询失败|invalid input value|工具错误|tool error/i,
    );
    await expect(errorLocator).toHaveCount(0);

    // 助手文本应有实质内容
    const text = (await assistantBubble.innerText()).trim();
    expect(text.length).toBeGreaterThan(10);
  });
});
