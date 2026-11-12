import { expect, type Page, test } from "@playwright/test";

const editor = (page: Page) => page.getByTestId("editor");
const blockLines = (page: Page) => page.locator(".cm-line.blk-first");
const savedDelay = (page: Page) => page.waitForTimeout(450); // 300ms 防抖 + 余量

async function open(page: Page) {
  await page.goto("/");
  await editor(page).click();
}

test("首次打开只有一个空块,并显示快捷键提示", async ({ page }) => {
  await page.goto("/");
  await expect(blockLines(page)).toHaveCount(1);
  await expect(blockLines(page).first()).toHaveAttribute("data-no", "01");
  await expect(page.locator(".keys")).toContainText("新块");
});

test("U2:⌘↵ 在当前块后新建块,重启后顺序和内容不变", async ({ page }) => {
  await open(page);
  await page.keyboard.type("第一块");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("第二块");
  await expect(blockLines(page)).toHaveCount(2);
  await expect(page.locator(".blk-cur.blk-first")).toHaveAttribute("data-no", "02");
  await savedDelay(page);
  await page.reload();
  await expect(blockLines(page)).toHaveCount(2);
  await expect(blockLines(page).nth(0)).toHaveText("第一块");
  await expect(blockLines(page).nth(1)).toHaveText("第二块");
});

test("U3:⌘A 先选中当前块,再按一次选中整页", async ({ page }) => {
  await open(page);
  await page.keyboard.type("alpha");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("beta");
  const selected = () => page.evaluate(() => window.getSelection()?.toString().replace(/\n+/g, "|"));
  await page.keyboard.press("ControlOrMeta+a");
  expect(await selected()).toBe("beta");
  await page.keyboard.press("ControlOrMeta+a");
  expect(await selected()).toContain("alpha");
  expect(await selected()).toContain("beta");
});

test("块首退格不会把两块合并;空块退格会删除这个块", async ({ page }) => {
  await open(page);
  await page.keyboard.type("one");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("two");
  await page.keyboard.press("Home");
  await page.keyboard.press("Backspace");
  await expect(blockLines(page)).toHaveCount(2);
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(blockLines(page)).toHaveCount(3);
  await page.keyboard.press("Backspace");
  await expect(blockLines(page)).toHaveCount(2);
  await page.keyboard.type("!");
  await expect(blockLines(page).nth(1)).toHaveText("two!");
});

test("U6:删除块后,重启也不会再出现", async ({ page }) => {
  await open(page);
  await page.keyboard.type("keep");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("x");
  await savedDelay(page);
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await savedDelay(page);
  await page.reload();
  await expect(blockLines(page)).toHaveCount(1);
  await expect(blockLines(page).first()).toHaveText("keep");
});

test("文末可以再往上滚约一屏,最后一行能滚到窗口上部", async ({ page }) => {
  await open(page);
  for (let i = 0; i < 60; i++) await page.keyboard.press("Enter");
  await page.keyboard.type("最后一行");
  const scroller = page.locator(".cm-scroller");
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const box = await scroller.boundingBox();
  const last = await page.locator(".cm-line", { hasText: "最后一行" }).boundingBox();
  if (!box || !last) throw new Error("no box");
  expect(last.y - box.y).toBeLessThan(box.height / 3);
});
