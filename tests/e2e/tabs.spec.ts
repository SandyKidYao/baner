import { expect, type Page, test } from "@playwright/test";

const rail = (page: Page) => page.getByRole("navigation", { name: "tab" });
const tabButtons = (page: Page) => rail(page).locator(".tab");
/** 各 tab 的单字(顺序) */
const glyphs = (page: Page) => rail(page).locator(".tab .tab-g");
/** 当前 tab 的名称 */
const current = (page: Page) => rail(page).locator(".tab.act .tab-n");
const editor = (page: Page) => page.getByTestId("editor");
const firstLine = (page: Page) => page.locator(".cm-line.blk-first").first();
const menu = (page: Page) => page.getByRole("menu");
const menuItem = (page: Page, name: string | RegExp) => menu(page).getByRole("menuitem", { name });
/** 与 src/rail/TabStrip.tsx 的 LONG_PRESS_MS 一致 */
const LONG_PRESS_MS = 350;

test("首次打开自动建好「工作」tab", async ({ page }) => {
  await page.goto("/");
  await expect(tabButtons(page)).toHaveCount(1);
  await expect(glyphs(page).first()).toHaveText("工");
  await expect(current(page)).toHaveText("工作");
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
  await expect(glyphs(page)).toHaveText(["工", "需"]);
  await expect(current(page)).toHaveText("需求池");

  await editor(page).click();
  await page.keyboard.type("需求内容");
  await page.keyboard.press("ControlOrMeta+1");
  await expect(firstLine(page)).toHaveText("工作内容");
  await page.keyboard.press("ControlOrMeta+2");
  await expect(firstLine(page)).toHaveText("需求内容");

  await page.waitForTimeout(450);
  await page.reload();
  await expect(glyphs(page)).toHaveText(["工", "需"]);
  await expect(current(page)).toHaveText("需求池"); // 记住上次打开的 tab
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
  await expect(current(page)).toHaveText("工作");
});

/** 新建若干 tab,名字依次为 names */
async function makeTabs(page: Page, names: string[]) {
  for (const n of names) {
    await rail(page).getByRole("button", { name: "新 tab" }).click();
    await page.getByLabel("tab 名称").fill(n);
    await page.getByLabel("tab 名称").press("Enter");
    await expect(current(page)).toHaveText(n);
  }
}

/** 按住第 from 个 tab(hold 为 true 时先等过长按时长),拖到 x 处松开 */
async function pressAndDrag(page: Page, from: number, x: (b: Box) => number, hold = true) {
  const a = await tabButtons(page).nth(from).boundingBox();
  if (!a) throw new Error("no box");
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  if (hold) {
    await page.waitForTimeout(LONG_PRESS_MS + 100);
    await expect(rail(page).locator(".tab.dragging")).toHaveCount(1); // 浮起
  }
  return async (to: number) => {
    const b = await tabButtons(page).nth(to).boundingBox();
    if (!b) throw new Error("no box");
    await page.mouse.move(x(b), b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
  };
}
type Box = { x: number; y: number; width: number; height: number };

/** 长按第 from 个 tab,拖到第 to 个 tab 的左半部分 */
async function dragTab(page: Page, from: number, to: number) {
  await (await pressAndDrag(page, from, (b) => b.x + 4))(to);
}

test("长按后拖动排序 tab,重启后顺序不变;拖动不会误触切换", async ({ page }) => {
  await page.goto("/");
  await makeTabs(page, ["甲", "乙"]);
  await expect(glyphs(page)).toHaveText(["工", "甲", "乙"]);

  // 没按够就拖:不排序
  await (await pressAndDrag(page, 2, (b) => b.x + 4, false))(0);
  await expect(glyphs(page)).toHaveText(["工", "甲", "乙"]);
  await expect(rail(page).locator(".tab.dragging")).toHaveCount(0);

  await dragTab(page, 2, 0);
  await expect(glyphs(page)).toHaveText(["乙", "工", "甲"]);
  await expect(current(page)).toHaveText("乙"); // 当前 tab 没变

  // 拖到最后:落在最后一个 tab 的右半部分
  await (await pressAndDrag(page, 0, (b) => b.x + b.width - 2))(2);
  await expect(glyphs(page)).toHaveText(["工", "甲", "乙"]);

  await page.waitForTimeout(100);
  await page.reload();
  await expect(glyphs(page)).toHaveText(["工", "甲", "乙"]);
  // 普通点击仍然是切换
  await tabButtons(page).nth(1).click();
  await expect(current(page)).toHaveText("甲");
});

test("右键菜单的左移、右移(键盘可用:Shift+F10 打开,方向键选择)", async ({ page }) => {
  await page.goto("/");
  await makeTabs(page, ["甲"]);
  await tabButtons(page).nth(1).click({ button: "right" });
  await expect(menuItem(page, "右移")).toBeDisabled();
  await menuItem(page, "左移").click();
  await expect(glyphs(page)).toHaveText(["甲", "工"]);

  await tabButtons(page).nth(0).focus();
  await page.keyboard.press("Shift+F10");
  await expect(menuItem(page, "改名")).toBeFocused(); // 焦点落在第一个可用项
  await page.keyboard.press("ArrowDown"); // 左移不可用,跳过
  await expect(menuItem(page, "右移")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(glyphs(page)).toHaveText(["工", "甲"]);
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
  await expect(page.locator(".strip .tab.act .badge")).toBeVisible();
  await tabButtons(page).first().click({ button: "right" });
  await expect(enc).toHaveAttribute("aria-checked", "true");
});

test("同步与加密在桌面上是页面右侧的岛,不盖住正在写的页面", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "同步与加密" }).click();
  const panel = page.getByRole("region", { name: "同步与加密" });
  await expect(panel).toBeVisible();
  const p = await panel.boundingBox();
  const e = await page.getByTestId("editor").boundingBox();
  expect(p && e && p.x >= e.x + e.width).toBeTruthy();
});

test("双击 tab 原地改名(单击当前 tab 不改名);右键菜单「改名」改别的 tab;Esc 取消", async ({ page }) => {
  await page.goto("/");
  await makeTabs(page, ["甲"]);
  await rail(page).locator(".tab.act").click();
  await expect(page.getByLabel("tab 名称")).toHaveCount(0);
  await rail(page).locator(".tab.act").dblclick();
  await page.getByLabel("tab 名称").fill("甲方");
  await page.getByLabel("tab 名称").press("Enter");
  await expect(current(page)).toHaveText("甲方");

  await tabButtons(page).first().click({ button: "right" });
  await menuItem(page, "改名").click();
  await expect(current(page)).toHaveCount(0); // 改名中:输入框代替了 tab
  await page.getByLabel("tab 名称").fill("不要");
  await page.getByLabel("tab 名称").press("Escape");
  await expect(current(page)).toHaveText("工作");
  await expect(rail(page).locator(".tab .tab-n")).toHaveText(["工作", "甲方"]);
});

test("状态栏:右下角 ⚙ 打开同步与加密,配置岛与页面岛底边对齐", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".keys")).toContainText("新 tab");
  await expect(page.locator(".keys")).toContainText("格式化代码");
  await page.locator(".keys").getByRole("button", { name: "同步与加密" }).click();
  const panel = await page.getByRole("region", { name: "同步与加密" }).boundingBox();
  const island = await page.locator(".page-island").boundingBox();
  if (!panel || !island) throw new Error("no box");
  expect(Math.abs(panel.y + panel.height - (island.y + island.height))).toBeLessThan(1);
});
