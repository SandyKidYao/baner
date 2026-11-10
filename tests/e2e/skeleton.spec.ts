import { expect, test } from "@playwright/test";

test("输入的内容在重新加载后仍然存在", async ({ page }) => {
  await page.goto("/");
  const editor = page.getByTestId("editor");
  await editor.click();
  await page.keyboard.type("hello baner");
  await page.waitForTimeout(450); // 等待 300ms 的防抖保存
  await page.reload();
  await expect(page.getByTestId("editor")).toHaveText("hello baner");
});
