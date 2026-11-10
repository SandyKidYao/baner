import { expect, type Page, test } from "@playwright/test";

const openSettings = (page: Page) => page.getByRole("button", { name: "同步与加密" }).click();
const panel = (page: Page) => page.getByRole("region", { name: "同步与加密" });

test("U7:未配置时不显示同步符号;配置仓库与 token 后开始同步", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sync-btn")).toHaveCount(0);
  await openSettings(page);
  await expect(panel(page).locator(".mark.no")).toHaveCount(3);

  await panel(page).getByLabel("仓库").fill("https://github.com/me/notes.git");
  await panel(page)
    .getByLabel(/^token/)
    .fill("ghp_test");
  await panel(page).getByRole("button", { name: "保存并同步" }).click();

  await expect(panel(page).locator(".mark.ok")).toHaveCount(3);
  await expect(panel(page).getByLabel(/^token/)).toHaveValue(""); // 保存后不再回显
  await expect(panel(page).getByText("已保存,留空不修改")).toBeVisible();
  await expect(page.getByRole("button", { name: /已同步/ })).toBeVisible();
  expect(await page.evaluate(() => Number(localStorage.getItem("baner-mock-sync-count")))).toBeGreaterThan(0);
});

test("U7:按 tab 关闭同步,重启后保持", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  const tog = panel(page).getByRole("button", { name: "同步「工作」" });
  await expect(tog).toHaveAttribute("aria-pressed", "true");
  await tog.click();
  await expect(tog).toHaveAttribute("aria-pressed", "false");
  await page.reload();
  await openSettings(page);
  await expect(panel(page).getByRole("button", { name: "同步「工作」" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("U8:同步失败时显示 ✕,点开看到原因并可以重试", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  await panel(page).getByLabel("仓库").fill("https://github.com/me/notes.git");
  await panel(page)
    .getByLabel(/^token/)
    .fill("bad");
  await page.evaluate(() =>
    localStorage.setItem("baner-mock-sync-error", "git: unexpected http status code: 401"),
  );
  await panel(page).getByRole("button", { name: "保存并同步" }).click();

  const btn = page.getByRole("button", { name: /同步失败/ });
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.getByRole("alert")).toContainText("token 无效或没有权限");

  await page.evaluate(() => localStorage.removeItem("baner-mock-sync-error"));
  await page.getByRole("alert").getByRole("button", { name: "重试" }).click();
  await expect(page.getByRole("button", { name: /已同步/ })).toBeVisible();
});

test("冲突标记所在的块显示冲突样式", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("editor").click();
  await page.keyboard.type("<<<<<<< 本机\na\n=======\nb\n>>>>>>> 远端");
  await expect(page.locator(".blk-conflict").first()).toBeVisible();
});

async function configureWithIncoming(page: Page) {
  await page.evaluate(() =>
    localStorage.setItem(
      "baner-mock-sync-incoming",
      JSON.stringify({
        tabs: [{ id: "remote1", name: "需求池", glyph: "需", key: "a5" }],
        blocks: { remote1: [{ id: "rb1", key: "a0", text: "来自另一台设备" }] },
      }),
    ),
  );
  await openSettings(page);
  await panel(page).getByLabel("仓库").fill("https://github.com/me/notes.git");
  await panel(page).getByRole("button", { name: "保存并同步" }).click();
}

test("新设备首次同步:自动建的空「工作」tab 被远端内容取代", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".rail button.tab:not(.add)")).toHaveText(["工"]);
  await configureWithIncoming(page);
  await expect(page.locator(".rail button.tab:not(.add)")).toHaveText(["需"]);
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.locator(".cm-line.blk-first").first()).toHaveText("来自另一台设备");
});

test("占位 tab 里写过内容就保留", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("editor").click();
  await page.keyboard.type("我自己的内容");
  await page.waitForTimeout(450);
  await configureWithIncoming(page);
  await expect(page.locator(".rail button.tab:not(.add)")).toHaveText(["工", "需"]);
});
