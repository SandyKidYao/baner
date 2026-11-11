import { expect, type Page, test } from "@playwright/test";

const rail = (page: Page) => page.getByRole("navigation", { name: "tab" });
const tabButtons = (page: Page) => rail(page).locator("button.tab:not(.add)");
const editor = (page: Page) => page.getByTestId("editor");
const firstLine = (page: Page) => page.locator(".cm-line.blk-first").first();
const menu = (page: Page) => page.getByRole("menu");
const menuItem = (page: Page, name: string | RegExp) => menu(page).getByRole("menuitem", { name });

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

test("右键菜单删除 tab 要原地再按一次确认;只剩一个 tab 时不能删除;页头没有删除按钮", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".ph").getByRole("button", { name: /删除/ })).toHaveCount(0);
  await tabButtons(page).first().click({ button: "right" });
  await expect(menuItem(page, "删除")).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);

  await rail(page).getByRole("button", { name: "新 tab" }).click();
  await page.getByLabel("tab 名称").press("Enter");
  await expect(tabButtons(page)).toHaveCount(2);

  await tabButtons(page).nth(1).click({ button: "right" });
  await menuItem(page, "删除").click();
  await expect(tabButtons(page)).toHaveCount(2);
  await menuItem(page, "再按一次确认删除").click();
  await expect(tabButtons(page)).toHaveCount(1);
  await expect(page.locator(".ph-name")).toHaveText("工作");
});

/** 新建若干 tab,名字依次为 names */
async function makeTabs(page: Page, names: string[]) {
  for (const n of names) {
    await rail(page).getByRole("button", { name: "新 tab" }).click();
    await page.getByLabel("tab 名称").fill(n);
    await page.getByLabel("tab 名称").press("Enter");
    await expect(page.locator(".ph-name")).toHaveText(n);
  }
}

/** 用鼠标把第 from 个 tab 拖到第 to 个 tab 的上半部分 */
async function dragTab(page: Page, from: number, to: number) {
  const a = await tabButtons(page).nth(from).boundingBox();
  const b = await tabButtons(page).nth(to).boundingBox();
  if (!a || !b) throw new Error("no box");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + 4, { steps: 8 });
  await page.mouse.up();
}

test("拖动排序 tab,重启后顺序不变;拖动不会误触切换", async ({ page }) => {
  await page.goto("/");
  await makeTabs(page, ["甲", "乙"]);
  await expect(tabButtons(page)).toHaveText(["工", "甲", "乙"]);
  await dragTab(page, 2, 0);
  await expect(tabButtons(page)).toHaveText(["乙", "工", "甲"]);
  await expect(page.locator(".ph-name")).toHaveText("乙"); // 当前 tab 没变

  // 拖到最后:落在最后一个 tab 的下方
  const a = await tabButtons(page).nth(0).boundingBox();
  const b = await tabButtons(page).nth(2).boundingBox();
  if (!a || !b) throw new Error("no box");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 2, { steps: 8 });
  await page.mouse.up();
  await expect(tabButtons(page)).toHaveText(["工", "甲", "乙"]);

  await page.waitForTimeout(100);
  await page.reload();
  await expect(tabButtons(page)).toHaveText(["工", "甲", "乙"]);
  // 普通点击仍然是切换
  await tabButtons(page).nth(1).click();
  await expect(page.locator(".ph-name")).toHaveText("甲");
});

test("右键菜单的上移、下移(键盘可用:Shift+F10 打开,方向键选择)", async ({ page }) => {
  await page.goto("/");
  await makeTabs(page, ["甲"]);
  await tabButtons(page).nth(1).click({ button: "right" });
  await expect(menuItem(page, "下移")).toBeDisabled();
  await menuItem(page, "上移").click();
  await expect(tabButtons(page)).toHaveText(["甲", "工"]);

  await tabButtons(page).nth(0).focus();
  await page.keyboard.press("Shift+F10");
  await expect(menuItem(page, "下移")).toBeFocused(); // 上移不可用,焦点落在第一个可用项
  await page.keyboard.press("Enter");
  await expect(tabButtons(page)).toHaveText(["工", "甲"]);
  await expect(tabButtons(page).nth(1)).toBeFocused(); // 焦点回到打开菜单的 tab
});

test("右键菜单开关同步,与配置面板一致", async ({ page }) => {
  await page.goto("/");
  await tabButtons(page).first().click({ button: "right" });
  const item = page.getByRole("menuitemcheckbox", { name: "同步" });
  await expect(item).toHaveAttribute("aria-checked", "true");
  await item.click();
  await expect(menu(page)).toHaveCount(0);
  await tabButtons(page).first().click({ button: "right" });
  await expect(item).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "同步与加密" }).click();
  await expect(page.getByRole("button", { name: "同步「工作」" })).toHaveAttribute("aria-pressed", "false");
});

test("右键菜单加密:没有主密钥时引导去配置;有主密钥时直接开关", async ({ page }) => {
  await page.goto("/");
  await tabButtons(page).first().click({ button: "right" });
  await menuItem(page, /加密/).click();
  const panel = page.getByRole("region", { name: "同步与加密" });
  await expect(panel).toBeVisible();
  await panel.getByLabel(/设置主密钥/).fill("correct horse");
  await panel.getByLabel("再输一次").fill("correct horse");
  await panel.getByRole("button", { name: "设置" }).click();
  await expect(panel.getByText("本机已配置主密钥")).toBeVisible();
  await page.getByRole("button", { name: "关闭" }).click();

  await tabButtons(page).first().click({ button: "right" });
  const enc = page.getByRole("menuitemcheckbox", { name: "加密" });
  await expect(enc).toHaveAttribute("aria-checked", "false");
  await enc.click();
  await expect(page.locator(".rail .tab.act .badge")).toBeVisible();
  await tabButtons(page).first().click({ button: "right" });
  await expect(enc).toHaveAttribute("aria-checked", "true");
});
