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

test("源码模式显示行号:每块从 1 开始,与文件里的行号一致", async ({ page }) => {
  await open(page);
  await page.keyboard.type("第一行");
  await page.keyboard.press("Enter");
  await page.keyboard.type("第二行");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("下一块");
  await expect(page.locator(".cm-line[data-ln]")).toHaveCount(0); // 所见模式不显示
  await page.keyboard.press("ControlOrMeta+e");
  const lns = await page
    .locator(".cm-line[data-ln]")
    .evaluateAll((els) => els.map((e) => e.getAttribute("data-ln")));
  expect(lns).toEqual(["1", "2", "1"]);
});

test("Tab 在编辑器里缩进:光标处插入两个空格;列表项整项缩进;Shift+Tab 反缩进;焦点不离开编辑器", async ({
  page,
}) => {
  await open(page);
  await page.keyboard.type("ab");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Tab");
  await expect(line(page, 0)).toHaveText("a  b");
  await expect(editor(page)).toBeFocused();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("- 父项");
  await page.keyboard.press("Enter");
  await page.keyboard.type("子项");
  await page.keyboard.press("Tab");
  await page.keyboard.press("ControlOrMeta+e"); // 源码模式看原文
  await expect(line(page, 2)).toHaveText("  - 子项");
  await page.keyboard.press("Shift+Tab");
  await expect(line(page, 2)).toHaveText("- 子项");
  // ⌘A 两次选中整页再 Tab:各块的正文都缩进,块结构不受影响
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("第二块");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Tab");
  await expect(page.locator(".cm-line.blk-first")).toHaveCount(2);
  await expect(page.locator(".cm-line.blk-first").nth(1)).toHaveText("  第二块");
  // 键盘离开编辑器:先 Esc 再 Tab(CodeMirror 的约定)
  await page.keyboard.press("Escape");
  await page.keyboard.press("Tab");
  await expect(editor(page)).not.toBeFocused();
});

test("代码块:所见模式渲染成带语言标签与复制按钮的盒子,代码高亮;点代码进入编辑", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  await page.keyboard.type("说明");
  await page.keyboard.press("Enter");
  await page.keyboard.type('```js\nconst a = 1; // 注释\nconsole.log("hi")\n```');
  await page.keyboard.press("Enter");
  await page.keyboard.type("后面的文字");
  const box = page.locator(".cb");
  await expect(box).toBeVisible();
  await expect(box.locator(".cb-lang")).toHaveText("js");
  await expect(box.locator(".cb-line")).toHaveText(["const a = 1; // 注释", 'console.log("hi")']);
  // 语言解析器按需加载后有高亮
  await expect(box.locator(".cb-line").first().locator("span").first()).toBeVisible({ timeout: 10_000 });
  await box.getByRole("button", { name: "复制代码" }).click();
  await expect(box.getByRole("button", { name: "复制代码" })).toHaveAttribute("title", "已复制"); // 图标变成 ✓
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    'const a = 1; // 注释\nconsole.log("hi")',
  );
  // 点代码:回到原样,光标在那一行
  await box.locator(".cb-line").nth(1).click();
  await expect(page.locator(".cb")).toHaveCount(0);
  await expect(page.locator(".cm-line.md-codeblock")).toHaveCount(4);
  await expect(page.locator(".cm-line.md-codeblock").first()).toContainText("```js");
  await expect(page.locator(".cb-copy-inline")).toHaveCount(1); // 原样时复制按钮在开头一行末尾
});

test("没闭合的代码块不会吞掉后面的块", async ({ page }) => {
  await open(page);
  await page.keyboard.type("```\n没写完的代码");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("## 下一块的标题");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("x");
  await expect(page.locator(".cm-line.md-h2")).toHaveText("下一块的标题");
});

test("⇧⌥F 格式化光标所在代码块;语法错误和不支持的语言在 ``` 那一行末尾提示", async ({ page }) => {
  await open(page);
  await page.keyboard.type("```ts\nconst  a={b:1,c:[1,2]}\nfunction f( x ){return x*2}\n```");
  await page.keyboard.press("ArrowUp"); // 回到代码里
  await page.keyboard.press("Shift+Alt+f");
  await expect(page.locator(".cb-note")).toHaveText("✓ 已格式化", { timeout: 15_000 });
  await expect(page.locator(".cm-line.md-codeblock")).toHaveText([
    "```ts",
    "const a = { b: 1, c: [1, 2] };",
    "function f(x) {",
    "  return x * 2;",
    "}",
    "```",
  ]);
  await expect(page.locator(".cb-note")).toHaveCount(0, { timeout: 5_000 }); // 几秒后消失

  // 语法错误:内容不变,提示第几行
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type('```json\n{"a": 1,,}\n```');
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Shift+Alt+f");
  await expect(page.locator(".cb-note")).toContainText("语法错误", { timeout: 15_000 });
  await expect(page.locator(".cm-line.md-codeblock").filter({ hasText: '{"a": 1,,}' })).toHaveCount(1);

  // 不支持的语言
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("```python\nx=1\n```");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Shift+Alt+f");
  await expect(page.locator(".cb-note")).toHaveText("✕ 不支持格式化 python");
});

test("上下方向键可以进入渲染好的代码块(包括从下一块按 ↑)", async ({ page }) => {
  await open(page);
  await page.keyboard.type("上面");
  await page.keyboard.press("Enter");
  await page.keyboard.type("```ts\nconst a = 1;\nconst b = 2;\n```");
  await page.keyboard.press("ControlOrMeta+Enter");
  await page.keyboard.type("下一块");
  await expect(page.locator(".cb")).toBeVisible();
  await page.keyboard.press("ArrowUp"); // 越过块分隔,进到代码最后一行
  await expect(page.locator(".cb")).toHaveCount(0);
  await page.keyboard.type("X");
  await expect(page.locator(".cm-line.md-codeblock").nth(2)).toHaveText(/X/);
  // 回到「上面」那一行,再按 ↓ 进到代码第一行(列位置保留)
  await line(page, 0).click();
  await page.keyboard.press("End");
  await expect(page.locator(".cb")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("Y");
  await expect(page.locator(".cm-line.md-codeblock").nth(1)).toHaveText("coYnst a = 1;");
});
