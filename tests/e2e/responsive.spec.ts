import { expect, type Page, test } from "@playwright/test";

const PHONE = { width: 375, height: 740 };
const editor = (page: Page) => page.getByTestId("editor");
const blockLines = (page: Page) => page.locator(".cm-line.blk-first");
const menu = (page: Page) => page.getByRole("button", { name: "打开 tab 列表" });
const drawer = (page: Page) => page.locator(".drawer");

test.use({ viewport: PHONE });

test("U18:窄窗口下轨道收进 ≡ 抽屉,当前 tab 名在顶部,快捷键提示隐藏", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".rail")).toHaveCount(0);
  await expect(menu(page)).toBeVisible();
  await expect(page.locator(".ph-name")).toHaveText("工作");
  await expect(page.locator(".keys")).toBeHidden();
  const box = await menu(page).boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44); // 触控目标不小于 44×44
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test("U18:抽屉里新建、切换 tab;Esc 和遮罩都能关闭", async ({ page }) => {
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.type("工作内容");

  await menu(page).click();
  await expect(drawer(page).getByRole("button", { name: "工作" })).toBeFocused();
  await drawer(page).getByRole("button", { name: "新 tab" }).click();
  await expect(drawer(page)).toHaveCount(0);
  const name = page.getByLabel("tab 名称");
  await name.fill("需求池");
  await name.press("Enter");
  await expect(page.locator(".ph-name")).toHaveText("需求池");

  await menu(page).click();
  await page.keyboard.press("Escape");
  await expect(drawer(page)).toHaveCount(0);
  await expect(menu(page)).toBeFocused();

  await menu(page).click();
  await page.getByRole("button", { name: "关闭 tab 列表" }).click({ position: { x: 360, y: 400 } });
  await expect(drawer(page)).toHaveCount(0);

  await menu(page).click();
  await drawer(page).getByRole("button", { name: "工作" }).click();
  await expect(page.locator(".ph-name")).toHaveText("工作");
  await expect(blockLines(page).first()).toHaveText("工作内容");
});

test("U18:抽屉里打开同步与加密配置", async ({ page }) => {
  await page.goto("/");
  await menu(page).click();
  await drawer(page).getByRole("button", { name: "同步与加密" }).click();
  await expect(page.locator(".panel")).toBeVisible();
  await expect(page.getByRole("button", { name: "新块" })).toHaveCount(0); // 配置面板打开时不显示 +
});

test("U18:右下角 + 新建文本块", async ({ page }) => {
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.type("一");
  const fab = page.getByRole("button", { name: "新块" });
  const box = await fab.boundingBox();
  expect(box && box.x + box.width).toBeGreaterThan(PHONE.width - 70);
  expect(box && box.y + box.height).toBeGreaterThan(PHONE.height - 70);
  await fab.click();
  await page.keyboard.type("二");
  await expect(blockLines(page)).toHaveText(["一", "二"]);
});

test("手机布局下图块只读:预览不可点,⌘D 不插入", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("baner-mock-store")) return;
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="100" height="40" x="10" y="10" fill="none" stroke="#000"/></svg>';
    localStorage.setItem(
      "baner-mock-store",
      JSON.stringify({
        __tabs: [{ id: "t1", name: "工作", glyph: "工", key: "a0" }],
        t1: [
          { id: "b1", key: "a0", text: "文字" },
          { id: "d1", key: "a1", text: "", kind: "draw" },
        ],
        __drawings: { "t1/d1": { scene: '{"elements":[]}', svg } },
      }),
    );
  });
  await page.goto("/");
  const draw = page.getByTestId("draw-block");
  await expect(draw.locator("img")).toBeVisible();
  await expect(page.getByRole("button", { name: "编辑图块" })).toHaveCount(0);
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.getByTestId("draw-block")).toHaveCount(1);
  await expect(page.locator(".draw.editing")).toHaveCount(0);

  // 窗口变宽后恢复轨道,图块可以编辑
  await page.setViewportSize({ width: 960, height: 720 });
  await expect(page.locator(".rail")).toBeVisible();
  await expect(page.getByRole("button", { name: "编辑图块" })).toBeVisible();
});

test("U18:抽屉里右键 tab 打开菜单,可以删除", async ({ page }) => {
  await page.goto("/");
  await menu(page).click();
  await drawer(page).getByRole("button", { name: "新 tab" }).click();
  await page.getByLabel("tab 名称").press("Enter");
  await menu(page).click();
  await drawer(page).getByRole("button", { name: "新 tab" }).first().click({ button: "right" });
  const ctx = page.getByRole("menu");
  await ctx.getByRole("menuitem", { name: "删除" }).click();
  await ctx.getByRole("menuitem", { name: "再按一次确认删除" }).click();
  await expect(page.locator(".ph-name")).toHaveText("工作");
});
