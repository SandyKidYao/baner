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
  await expect(page.locator(".strip .tab.act .badge")).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.locator(".ph-meta .ph-lock")).toContainText("加密"); // 页头状态区显示锁
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
  await expect(page.getByRole("button", { name: "加密 tab" }).locator(".tab-g")).toHaveText("⚿");
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
  await expect(page.locator(".strip .tab.act .tab-g")).toHaveText("钥");
  await expect(page.locator(".cm-line.blk-first").first()).toHaveText("GITHUB_TOKEN=ghp_xxx");
});

test("新设备还没同步就设置主密钥:仓库里已有主密钥时提示输入另一台设备上的那个", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "baner-mock-store",
      JSON.stringify({
        __crypto: { configured: false, repoHasIdentity: false, remotePass: "correct horse" },
      }),
    ),
  );
  await page.reload();
  await openSettings(page);
  await panel(page)
    .getByLabel(/设置主密钥/)
    .fill("my new key!");
  await panel(page).getByLabel("再输一次").fill("my new key!");
  await panel(page).getByRole("button", { name: "设置" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("仓库里已有主密钥,请输入另一台设备上设置的那个");
  // 切换成「输入」模式
  await expect(panel(page).getByLabel("再输一次")).toHaveCount(0);
  await panel(page)
    .getByLabel(/输入主密钥/)
    .fill("correct horse");
  await panel(page).getByRole("button", { name: "解锁" }).click();
  await expect(panel(page).getByText("本机已配置主密钥")).toBeVisible();
});

test("同步后本机没用过的钥匙被仓库里的主密钥取代:提示重新输入", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem(
      "baner-mock-store",
      JSON.stringify({
        __crypto: {
          configured: true,
          repoHasIdentity: true,
          pass: "my own key",
          remotePass: "correct horse",
        },
        __sync: {
          remoteUrl: "https://github.com/octo/notes.git",
          githubLogin: "octo",
          unsyncedTabs: [],
          hasToken: true,
        },
      }),
    );
    localStorage.setItem("baner-mock-sync-keyreset", "1");
  });
  await page.reload();
  await expect(page.getByRole("button", { name: /已同步/ })).toBeVisible();
  await openSettings(page);
  await expect(panel(page).getByLabel(/输入主密钥/)).toBeVisible();
});

test("加密 tab 的钥匙和本机的对不上:显示锁定原因", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "baner-mock-store",
      JSON.stringify({
        __tabs: [{ id: "k1", name: "密钥", glyph: "钥", key: "a0", encrypted: true }],
        __crypto: { configured: true, repoHasIdentity: true, pass: "x", mismatch: ["k1"] },
        k1: [{ id: "b1", key: "a0", text: "secret" }],
      }),
    ),
  );
  await page.reload();
  await expect(page.getByText("这个 tab 用的是另一把主密钥")).toBeVisible();
  await expect(page.getByText("本机的主密钥和仓库里的不一致")).toBeVisible();
});
