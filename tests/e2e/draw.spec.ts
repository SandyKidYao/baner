import { expect, type Page, test } from "@playwright/test";

const editor = (page: Page) => page.getByTestId("editor");
const draws = (page: Page) => page.getByTestId("draw-block");
const blockLines = (page: Page) => page.locator(".cm-line.blk-first");
const line0 = (page: Page) => page.locator(".cm-line").first();
const canvas = (page: Page) => page.locator(".excalidraw canvas.interactive");
const savedDelay = (page: Page) => page.waitForTimeout(450);

type MockDb = Record<string, unknown> & { __drawings?: Record<string, { scene: string; svg: string }> };
const mockDb = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("baner-mock-store") ?? "{}")) as Promise<MockDb>;

/** 在图块画布上拖出一个矩形 */
async function drawRect(page: Page) {
  await expect(canvas(page)).toBeVisible({ timeout: 15_000 });
  const box = await canvas(page).boundingBox();
  if (!box) throw new Error("no canvas");
  await page.keyboard.press("r");
  const x = box.x + box.width / 2 - 80;
  const y = box.y + box.height / 2 - 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 160, y + 80, { steps: 8 });
  await page.mouse.up();
}

test("U5:⌘D 插入图块并原地打开 Excalidraw;✓ 后显示 SVG 预览,重启后还在", async ({ page }) => {
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.type("规划");
  await page.keyboard.press("ControlOrMeta+d");
  await expect(draws(page)).toHaveCount(1);
  await expect(draws(page)).toHaveClass(/editing/);
  await drawRect(page);
  await page.getByRole("button", { name: "完成" }).click();
  await expect(draws(page).locator("img")).toBeVisible();
  await expect(page.locator(".excalidraw")).toHaveCount(0); // 平时不加载 Excalidraw

  // 图块后补了一个文本块,光标在那里,可以直接接着写
  await page.keyboard.type("接着写");
  await savedDelay(page);

  // U6:场景 JSON 与 SVG 预览都存下来了
  const db = await mockDb(page);
  const [d] = Object.values(db.__drawings ?? {});
  expect(JSON.parse(d.scene).elements.map((e: { type: string }) => e.type)).toEqual(["rectangle"]);
  expect(d.svg).toMatch(/^<svg/);

  await page.reload();
  await expect(blockLines(page)).toHaveCount(2);
  await expect(blockLines(page).nth(0)).toHaveText("规划");
  await expect(blockLines(page).nth(1)).toHaveText("接着写");
  await expect(draws(page)).toHaveCount(1);
  await expect(draws(page).locator("img")).toBeVisible();
  await expect(page.locator(".excalidraw")).toHaveCount(0);
});

test("点击预览重新编辑;删除图块后 ⌘Z 可以撤销", async ({ page }) => {
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.type("a");
  await page.keyboard.press("ControlOrMeta+d");
  await drawRect(page);
  await page.getByRole("button", { name: "完成" }).click();
  await savedDelay(page);

  await page.getByRole("button", { name: "编辑图块" }).click();
  await expect(canvas(page)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "删除图块" }).click();
  await expect(draws(page)).toHaveCount(0);
  await savedDelay(page);
  expect(Object.keys((await mockDb(page)).__drawings ?? {})).toHaveLength(0);

  await page.keyboard.press("ControlOrMeta+z");
  await expect(draws(page)).toHaveCount(1);
  await expect(draws(page).locator("img")).toBeVisible();
  await savedDelay(page);
  expect(Object.keys((await mockDb(page)).__drawings ?? {})).toHaveLength(1);
});

test("什么都没画就按 ✓:图块被移除,不留空文件", async ({ page }) => {
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+d");
  await expect(canvas(page)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "完成" }).click();
  await expect(draws(page)).toHaveCount(0);
  await expect(blockLines(page)).toHaveCount(1);
  await savedDelay(page);
  expect((await mockDb(page)).__drawings ?? {}).toEqual({});
});

test("图块和文本块一起编号;编辑时只有图块是当前块;块工具条切换工具;底边可以调高度", async ({ page }) => {
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.type("a");
  await page.keyboard.press("ControlOrMeta+d");
  await expect(page.locator(".draw-no-n")).toHaveText("02");
  await expect(page.locator(".cm-line.blk-cur")).toHaveCount(0); // 光标所在的文本块不高亮
  await expect(canvas(page)).toBeVisible({ timeout: 15_000 });
  // Excalidraw 自带的工具条不显示,由块工具条代替
  await expect(page.locator(".excalidraw .App-toolbar")).toBeHidden();
  const tools = page.getByRole("toolbar", { name: "绘图工具" });
  await tools.getByRole("button", { name: "矩形" }).click();
  await expect(tools.getByRole("button", { name: "矩形" })).toHaveAttribute("aria-pressed", "true");
  // 在画布上按快捷键,块工具条跟着变
  await canvas(page).click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Escape");
  await page.keyboard.press("o");
  await expect(tools.getByRole("button", { name: "椭圆" })).toHaveAttribute("aria-pressed", "true");
  const handle = page.getByRole("separator", { name: /调整图块高度/ });
  const h0 = Number(await handle.getAttribute("aria-valuenow"));
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await expect(handle).toHaveAttribute("aria-valuenow", String(h0 + 20));
  await drawRect(page);
  await page.keyboard.press("ControlOrMeta+Enter"); // ⌘↵ 完成
  await expect(draws(page).locator("img")).toBeVisible();
  // 在图块前面插入一块,图块序号跟着变
  await line0(page).click();
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("b");
  await expect(page.locator(".draw-no-n")).toHaveText("03");
});

test("属性面板:选中图形时出现,改描边颜色和风格会写进场景", async ({ page }) => {
  await page.goto("/");
  await editor(page).click();
  await page.keyboard.press("ControlOrMeta+d");
  await drawRect(page); // 画完后矩形处于选中状态
  const panel = page.getByRole("region", { name: /图形属性/ });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "描边:红" }).click();
  await panel.getByRole("button", { name: "风格:规整" }).click();
  await expect(panel.getByRole("button", { name: "描边:红" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "完成" }).click();
  await savedDelay(page);
  const [d] = Object.values((await mockDb(page)).__drawings ?? {});
  const [rect] = JSON.parse(d.scene).elements;
  expect(rect.strokeColor).toBe("#e03131");
  expect(rect.roughness).toBe(0);
});
