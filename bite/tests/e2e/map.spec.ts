import { test, expect } from "@playwright/test";
import { login } from "./_utils/auth";

test.describe("map", () => {
  test.skip(
    !process.env.E2E_TEST_EMAIL || !process.env.E2E_TEST_PASSWORD,
    "E2E credentials not in bite/.env.local; skipping",
  );

  test("/map renders without crash", async ({ page }) => {
    await login(page);
    await page.goto("/map");

    // 等待：地图容器 / iframe / 空状态文案 任一出现即可
    const mapReady = page
      .locator(
        '[data-testid*="map"], [class*="map"], #map, .leaflet-container, .gm-style',
      )
      .or(page.locator("iframe"))
      .or(page.getByText(/还没有|暂无|没有.*地点|空/i))
      .first();
    await expect(mapReady).toBeVisible({ timeout: 20_000 });

    // 主断言：错误边界文案不应出现
    const errorBoundary = page.getByText(
      /something went wrong|出错了|app crashed|应用崩溃/i,
    );
    await expect(errorBoundary).toHaveCount(0);
  });
});
