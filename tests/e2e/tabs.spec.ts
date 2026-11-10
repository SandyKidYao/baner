import { expect, type Page, test } from "@playwright/test";

const rail = (page: Page) => page.getByRole("navigation", { name: "tab" });
const tabButtons = (page: Page) => rail(page).locator("button.tab:not(.add)");
const editor = (page: Page) => page.getByTestId("editor");
const firstLine = (page: Page) => page.locator(".cm-line.blk-first").first();

test("首次打开自动建好「工作」tab", async ({ page }) => {
  await page.goto("/");
  await expect(tabButtons(page)).toHaveCount(1);
  await expect(tabButtons(page).first()).toHaveText("工");
  await expect(page.locator(".ph-name")).toHaveText("工作");
});

test("U4:新建、改名、切换;各 tab 内容独立;重启后 tab 与顺序不变", async ({ page }) => {
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.type("工作内容");

  await rail(page).getByRole("button", { name: "新 tab" }).click();
  const nameInput = page.getByLabel("tab 名称");
  await expect(nameInput).toBeFocused();
  await nameInput.fill("需求池");
  await nameInput.press("Enter"); // 没动单字:自动跟随新名字的首字
  await expect(tabButtons(page)).toHaveText(["工", "需"]);
  await expect(page.locator(".ph-name")).toHaveText("需求池");

  await editor(page).click();
  await page.keyboard.type("需求内容");
  await page.keyboard.press("ControlOrMeta+1");
  await expect(firstLine(page)).toHaveText("工作内容");
  await page.keyboard.press("ControlOrMeta+2");
  await expect(firstLine(page)).toHaveText("需求内容");

  await page.waitForTimeout(450);
  await page.reload();
  await expect(tabButtons(page)).toHaveText(["工", "需"]);
  await expect(page.locator(".ph-name")).toHaveText("需求池"); // 记住上次打开的 tab
  await expect(firstLine(page)).toHaveText("需求内容");
});

test("⌘T 新建 tab", async ({ page }) => {
  await page.goto("/");
  await expect(tabButtons(page)).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+t");
  await expect(tabButtons(page)).toHaveCount(2);
});

test("删除 tab 要原地再按一次确认;只剩一个 tab 时不能删除", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "删除 tab" })).toHaveCount(0);
  await rail(page).getByRole("button", { name: "新 tab" }).click();
  await page.getByLabel("tab 名称").press("Enter");
  await expect(tabButtons(page)).toHaveCount(2);

  await page.getByRole("button", { name: "删除 tab" }).click();
  await expect(tabButtons(page)).toHaveCount(2);
  await page.getByRole("button", { name: "再按一次删除这个 tab" }).click();
  await expect(tabButtons(page)).toHaveCount(1);
  await expect(page.locator(".ph-name")).toHaveText("工作");
});
