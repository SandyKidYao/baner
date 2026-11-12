import { expect, type Page, test } from "@playwright/test";

const openSettings = (page: Page) => page.getByRole("button", { name: "同步与加密" }).click();
const panel = (page: Page) => page.getByRole("region", { name: "同步与加密" });

/** 用 GitHub 登录(模拟的 Device Flow)并选择仓库 */
async function loginAndPick(page: Page, repo = "octo/baner-notes") {
  await openSettings(page);
  await panel(page).getByRole("button", { name: "用 GitHub 登录" }).click();
  await panel(page).getByRole("list", { name: "仓库" }).getByRole("button", { name: repo }).click();
}

test("U7:未配置时不显示同步符号;用 GitHub 登录并选择仓库后开始同步", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sync-btn")).toHaveCount(0);
  await openSettings(page);
  await panel(page).getByRole("button", { name: "用 GitHub 登录" }).click();

  // 显示验证码;点按钮打开 GitHub 的验证码页面
  await expect(panel(page).getByLabel("验证码")).toHaveText("WDJB-MJHT");
  await panel(page).getByRole("button", { name: "复制验证码并打开 GitHub" }).click();
  expect(await page.evaluate(() => localStorage.getItem("baner-mock-opened"))).toBe('["device"]');

  // 授权完成后列出仓库
  const repos = panel(page).getByRole("list", { name: "仓库" });
  await expect(repos.getByRole("button")).toHaveText(["octo/baner-notes", "octo/blog"]);
  await expect(panel(page).getByText("@octo")).toBeVisible();
  await expect(page.locator(".sync-btn")).toHaveCount(0); // 还没选仓库

  await repos.getByRole("button", { name: "octo/baner-notes" }).click();
  await expect(panel(page).locator(".gh-current")).toContainText("octo/baner-notes");
  await expect(page.getByRole("button", { name: /已同步/ })).toBeVisible();
  expect(await page.evaluate(() => Number(localStorage.getItem("baner-mock-sync-count")))).toBeGreaterThan(0);
});

test("U7:换仓库、退出登录", async ({ page }) => {
  await page.goto("/");
  await loginAndPick(page);
  await panel(page).getByRole("button", { name: "换仓库" }).click();
  await expect(panel(page).getByText("换仓库后,本机的笔记会合并进新仓库")).toBeVisible();
  await panel(page).getByRole("list", { name: "仓库" }).getByRole("button", { name: "octo/blog" }).click();
  await expect(panel(page).locator(".gh-current")).toContainText("octo/blog");

  await panel(page).getByRole("button", { name: "退出登录" }).click();
  await expect(panel(page).getByRole("button", { name: "用 GitHub 登录" })).toBeVisible();
  await expect(panel(page).getByText("已选仓库 octo/blog,登录后继续同步")).toBeVisible();
  await expect(page.locator(".sync-btn")).toHaveCount(0);
});

test("U7:还没授权仓库时引导去安装 App,也可以新建私有仓库", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("baner-mock-github-repos", JSON.stringify({ installed: false, repos: [] })),
  );
  await openSettings(page);
  await panel(page).getByRole("button", { name: "用 GitHub 登录" }).click();
  await expect(panel(page).getByText("还没有仓库授权给 Baner")).toBeVisible();
  await panel(page).getByRole("button", { name: "授权仓库" }).click();
  await panel(page).getByRole("button", { name: "新建私有仓库" }).click();
  expect(await page.evaluate(() => localStorage.getItem("baner-mock-opened"))).toBe('["install","newRepo"]');
  await expect(panel(page).getByText("在 GitHub 上建好后")).toBeVisible();

  // 用户在浏览器里授权后回到应用:窗口获得焦点时刷新列表
  await page.evaluate(() => {
    localStorage.setItem(
      "baner-mock-github-repos",
      JSON.stringify({
        installed: true,
        repos: [{ fullName: "octo/baner-notes", private: true, pushedAt: null }],
      }),
    );
    window.dispatchEvent(new Event("focus"));
  });
  await expect(panel(page).getByRole("list", { name: "仓库" }).getByRole("button")).toHaveText([
    "octo/baner-notes",
  ]);
});

test("U7:验证码过期后可以重新获取", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("baner-mock-github-poll", "expired"));
  await openSettings(page);
  await panel(page).getByRole("button", { name: "用 GitHub 登录" }).click();
  await expect(panel(page).getByText("验证码已过期")).toBeVisible();
  await page.evaluate(() => localStorage.removeItem("baner-mock-github-poll"));
  await panel(page).getByRole("button", { name: "重新获取验证码" }).click();
  await expect(panel(page).getByRole("list", { name: "仓库" })).toBeVisible();
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
  await page.evaluate(() =>
    localStorage.setItem("baner-mock-sync-error", "git: unexpected http status code: 401"),
  );
  await loginAndPick(page);

  const btn = page.getByRole("button", { name: /同步失败/ });
  await expect(btn).toBeVisible();
  await btn.click();
  await expect(page.getByRole("alert")).toContainText("GitHub 授权失效,请重新登录");

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
  await loginAndPick(page);
}

test("新设备首次同步:自动建的空「工作」tab 被远端内容取代", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".strip .tab .tab-g")).toHaveText(["工"]);
  await configureWithIncoming(page);
  await expect(page.locator(".strip .tab .tab-g")).toHaveText(["需"]);
  await page.getByRole("button", { name: "关闭" }).click();
  await expect(page.locator(".cm-line.blk-first").first()).toHaveText("来自另一台设备");
});

test("占位 tab 里写过内容就保留", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("editor").click();
  await page.keyboard.type("我自己的内容");
  await page.waitForTimeout(450);
  await configureWithIncoming(page);
  await expect(page.locator(".strip .tab .tab-g")).toHaveText(["工", "需"]);
});

test("新设备首次同步时跳过还没用过的占位 tab;写了内容之后就同步它", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".strip .tab .tab-g")).toHaveText(["工"]);
  const ph = await page.evaluate(() => localStorage.getItem("baner.placeholderTab"));
  expect(ph).toBeTruthy();
  await loginAndPick(page);
  await expect(page.getByRole("button", { name: /已同步/ })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("baner-mock-sync-skip"))).toBe(JSON.stringify([ph]));

  await page.getByRole("button", { name: "关闭" }).click();
  await page.getByTestId("editor").click();
  await page.keyboard.type("我的第一条");
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: /已同步/ }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("baner-mock-sync-skip"))).toBe("[]");
});

test("新建、改名 tab 后会自动安排同步", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "baner-mock-store",
      JSON.stringify({
        __sync: {
          remoteUrl: "https://github.com/octo/notes.git",
          githubLogin: "octo",
          unsyncedTabs: [],
          hasToken: true,
        },
      }),
    ),
  );
  await page.reload();
  await page.clock.runFor(1000);
  await expect(page.getByRole("button", { name: /已同步/ })).toBeVisible();
  const count = () => page.evaluate(() => Number(localStorage.getItem("baner-mock-sync-count")));
  const before = await count();

  await page.getByRole("button", { name: "新 tab" }).click();
  await page.keyboard.type("想法");
  await page.keyboard.press("Enter");
  await expect(page.locator(".strip .tab")).toHaveCount(2);
  await page.clock.runFor(9000);
  expect(await count()).toBe(before); // 停手 10 秒后才同步
  await page.clock.runFor(2000);
  await expect.poll(count).toBe(before + 1);
});

test("已登录的新设备启动时自动同步:也会跳过刚建好的占位 tab", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("baner-mock-save-tab-delay", "300");
    localStorage.setItem(
      "baner-mock-store",
      JSON.stringify({
        __sync: {
          remoteUrl: "https://github.com/octo/notes.git",
          githubLogin: "octo",
          unsyncedTabs: [],
          hasToken: true,
        },
      }),
    );
  });
  await page.reload();
  await expect(page.getByRole("button", { name: /已同步/ })).toBeVisible();
  const ph = await page.evaluate(() => localStorage.getItem("baner.placeholderTab"));
  expect(ph).toBeTruthy();
  expect(await page.evaluate(() => localStorage.getItem("baner-mock-sync-skip"))).toBe(JSON.stringify([ph]));
});
