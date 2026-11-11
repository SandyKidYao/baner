import { expect, type Page, test } from "@playwright/test";

const editor = (page: Page) => page.getByTestId("editor");
const line = (page: Page, n: number) => page.locator(".cm-line").nth(n);
const mode = (page: Page, name: string) => page.locator(".ph").getByRole("button", { name });

async function open(page: Page) {
  await page.goto("/");
  await editor(page).click();
}

test("所见模式:光标不在的行隐藏标记并渲染;光标所在行显示标记", async ({ page }) => {
  await open(page);
  await page.keyboard.type("## 需求池");
  await page.keyboard.press("Enter");
  await page.keyboard.type("导出 **CSV** 和 `JSON`");
  // 第一行是标题,不在光标所在行:## 被隐藏
  await expect(line(page, 0)).toHaveClass(/md-h2/);
  await expect(line(page, 0)).toHaveText("需求池");
  // 光标所在行显示原样的标记
  await expect(line(page, 1)).toHaveText("导出 **CSV** 和 `JSON`");
  await page.keyboard.press("ArrowUp");
  await expect(line(page, 0)).toHaveText("## 需求池");
  await expect(line(page, 1)).toHaveText("导出 CSV 和 JSON");
  await expect(line(page, 1).locator(".md-strong")).toHaveText("CSV");
  await expect(line(page, 1).locator(".md-code")).toHaveText("JSON");
});

test("⌘E 切换到源码模式:标记全部可见、字号统一;重启后保持", async ({ page }) => {
  await open(page);
  await page.keyboard.type("## 标题");
  await page.keyboard.press("Enter");
  await page.keyboard.type("正文");
  await expect(mode(page, "所见即所得")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("ControlOrMeta+e");
  await expect(mode(page, "Markdown 源码")).toHaveAttribute("aria-pressed", "true");
  await expect(line(page, 0)).toHaveText("## 标题");
  await page.waitForTimeout(450);
  await page.reload();
  await expect(mode(page, "Markdown 源码")).toHaveAttribute("aria-pressed", "true");
  await expect(line(page, 0)).toHaveText("## 标题");
  await mode(page, "所见即所得").click();
  await expect(line(page, 0)).toHaveText("标题");
});

test("待办:点方框勾选,文件里的 [ ] 变成 [x];列表里回车续上前缀,空项回车结束列表", async ({ page }) => {
  await open(page);
  await page.keyboard.type("- [ ] 买咖啡豆");
  await page.keyboard.press("Enter");
  await expect(line(page, 1)).toHaveText("- [ ] ");
  await page.keyboard.type("换内胎");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter"); // 空的待办项:结束列表
  await page.keyboard.type("完");
  await expect(line(page, 2)).toHaveText("完");
  const box = line(page, 0).locator("input[type=checkbox]");
  await expect(box).not.toBeChecked();
  await box.click();
  await expect(line(page, 0).locator("input[type=checkbox]")).toBeChecked();
  await expect(line(page, 0).locator(".md-done")).toHaveText("买咖啡豆");
  await page.waitForTimeout(450);
  const db = await page.evaluate(() => JSON.parse(localStorage.getItem("baner-mock-store") ?? "{}"));
  const blocks = Object.entries(db).find(([k]) => !k.startsWith("__"))?.[1] as { text: string }[];
  expect(blocks[0].text).toBe("- [x] 买咖啡豆\n- [ ] 换内胎\n完");
});

test("Markdown 结构不会跨块:上一块的列表不会吞掉下一块", async ({ page }) => {
  await open(page);
  await page.keyboard.type("- 列表项");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("下一块的普通文字");
  await expect(page.locator(".cm-line.md-li")).toHaveCount(1);
  await expect(page.locator(".cm-line.blk-first").nth(1)).not.toHaveClass(/md-li/);
});
