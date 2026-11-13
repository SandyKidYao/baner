import { expect, type Page, test } from "@playwright/test";

const panel = (page: Page) => page.getByRole("region", { name: "同步与加密" });
const gear = (page: Page) => page.getByRole("button", { name: /^同步与加密/ });
/** 等应用渲染好(自动检查的计时器已经排上)再快进时钟 */
async function skipToFirstCheck(page: Page) {
  await expect(page.getByTestId("editor")).toBeVisible();
  await page.clock.fastForward(6000);
}
const NEW = { version: "0.1.2", currentVersion: "0.1.1", notes: "修了一些问题" };

test("设置面板显示版本号;手动检查更新,没有新版本时提示已是最新", async ({ page }) => {
  await page.goto("/");
  await gear(page).click();
  await expect(panel(page).locator(".app-version")).toHaveText("0.1.1");
  await panel(page).getByRole("button", { name: "检查更新" }).click();
  await expect(panel(page).getByText("已是最新版本")).toBeVisible();
});

test("手动检查更新失败时显示原因", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("baner-mock-update", "error"));
  await gear(page).click();
  await panel(page).getByRole("button", { name: "检查更新" }).click();
  await expect(panel(page).getByRole("alert")).toHaveText("✕ 连不上 GitHub,检查一下网络");
});

test("启动后自动检查:有新版本时 ⚙ 带圆点,面板里可以更新并重启", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript((u) => localStorage.setItem("baner-mock-update", u), JSON.stringify(NEW));
  await page.goto("/");
  await expect(page.locator(".keys .upd-dot")).toHaveCount(0);
  await skipToFirstCheck(page);
  await expect(page.getByRole("button", { name: "同步与加密(有新版本)" })).toBeVisible();
  await expect(page.locator(".keys .upd-dot")).toBeVisible();

  await gear(page).click();
  await expect(panel(page).getByText("新版本 0.1.2")).toBeVisible();
  await panel(page).getByRole("button", { name: "更新并重启" }).click();
  await expect(panel(page).getByRole("button", { name: "正在重启…" })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("baner-mock-update-installed"))).toBe("1");
});

test("后台检查失败不打扰:没有圆点也没有错误", async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => localStorage.setItem("baner-mock-update", "error"));
  await page.goto("/");
  await skipToFirstCheck(page);
  await expect
    .poll(() => page.evaluate(() => Number(localStorage.getItem("baner-mock-update-checks"))))
    .toBeGreaterThan(0);
  await expect(page.locator(".upd-dot")).toHaveCount(0);
  await gear(page).click();
  await expect(panel(page).getByRole("alert")).toHaveCount(0);
  await expect(panel(page).getByRole("button", { name: "检查更新" })).toBeVisible();
});

test("手机布局:有新版本时抽屉里的「同步与加密」带圆点", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.clock.install();
  await page.addInitScript((u) => localStorage.setItem("baner-mock-update", u), JSON.stringify(NEW));
  await page.goto("/");
  await skipToFirstCheck(page);
  await page.getByRole("button", { name: "打开 tab 列表" }).click();
  await expect(page.getByRole("button", { name: "同步与加密 有新版本" })).toBeVisible();
});
