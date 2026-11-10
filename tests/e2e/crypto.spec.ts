import { expect, type Page, test } from "@playwright/test";

const panel = (page: Page) => page.getByRole("region", { name: "同步与加密" });
const openSettings = (page: Page) => page.getByRole("button", { name: "同步与加密" }).click();

test("U10:设置主密钥(校验长度与两次一致),然后给 tab 开启加密", async ({ page }) => {
  await page.goto("/");
  await openSettings(page);
  const lock = panel(page).getByRole("button", { name: "加密「工作」" });
  await expect(lock).toBeDisabled(); // 没有主密钥前不能加密

  await panel(page)
    .getByLabel(/设置主密钥/)
    .fill("short");
  await panel(page).getByLabel("再输一次").fill("short");
  await panel(page).getByRole("button", { name: "设置" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("至少 8 位");

  await panel(page)
    .getByLabel(/设置主密钥/)
    .fill("correct horse");
  await panel(page).getByLabel("再输一次").fill("correct horsE");
  await expect(panel(page).getByRole("alert")).toContainText("两次输入不一致");
  await panel(page).getByLabel("再输一次").fill("correct horse");
  await panel(page).getByRole("button", { name: "设置" }).click();
  await expect(panel(page).getByText("本机已配置主密钥")).toBeVisible();

  await expect(lock).toBeEnabled();
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".rail .tab.act .badge")).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.locator(".ph-name")).toContainText("⚿");
});

test("另一台设备:本机没有主密钥时加密 tab 显示锁;输入正确的主密钥后解锁", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "baner-mock-store",
      JSON.stringify({
        __tabs: [{ id: "k1", name: "密钥", glyph: "钥", key: "a0", encrypted: true }],
        __crypto: { configured: false, repoHasIdentity: true, pass: "correct horse" },
        k1: [{ id: "b1", key: "a0", text: "GITHUB_TOKEN=ghp_xxx" }],
      }),
    ),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: "加密 tab" })).toHaveText("⚿");
  await expect(page.getByText("本机未配置主密钥")).toBeVisible();

  await page.getByRole("button", { name: "去配置主密钥" }).click();
  const input = panel(page).getByLabel(/输入主密钥/);
  await input.fill("wrong passphrase");
  await panel(page).getByRole("button", { name: "解锁" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("主密钥不正确");
  await input.fill("correct horse");
  await panel(page).getByRole("button", { name: "解锁" }).click();
  await expect(panel(page).getByText("本机已配置主密钥")).toBeVisible();

  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.locator(".rail .tab.act")).toHaveText("钥");
  await expect(page.locator(".cm-line.blk-first").first()).toHaveText("GITHUB_TOKEN=ghp_xxx");
});
