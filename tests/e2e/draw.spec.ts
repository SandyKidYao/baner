import { expect, type Page, test } from "@playwright/test";

const editor = (page: Page) => page.getByTestId("editor");
const draws = (page: Page) => page.getByTestId("draw-block");
const blockLines = (page: Page) => page.locator(".cm-line.blk-first");
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
