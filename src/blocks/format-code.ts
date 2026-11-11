// 代码块格式化(⇧⌥F)。按需加载:只有按下快捷键时才下载格式化器,不进启动包。
// Prettier 负责 JS/TS/JSON/CSS/HTML/Markdown/YAML/GraphQL,sql-formatter 负责 SQL。
import type { Plugin } from "prettier";

type Formatter = (code: string) => Promise<string>;

const estree = () => import("prettier/plugins/estree");
const babel = () => import("prettier/plugins/babel");
const typescript = () => import("prettier/plugins/typescript");
const postcss = () => import("prettier/plugins/postcss");

function prettier(parser: string, plugins: (() => Promise<unknown>)[]): Formatter {
  return async (code) => {
    const [{ format }, ...ps] = await Promise.all([
      import("prettier/standalone"),
      ...plugins.map((p) => p()),
    ]);
    return format(code, { parser, plugins: ps as Plugin[], printWidth: 80, tabWidth: 2 });
  };
}

const js = prettier("babel", [babel, estree]);
const ts = prettier("typescript", [typescript, estree]);
const json = prettier("json", [babel, estree]);
const css = prettier("css", [postcss]);
const sql: Formatter = async (code) => {
  const { format } = await import("sql-formatter");
  return format(code, { language: "sql", tabWidth: 2, keywordCase: "preserve" });
};

/** ``` 后面的语言名(小写)→ 格式化器 */
const FORMATTERS: Record<string, Formatter> = {
  js,
  javascript: js,
  mjs: js,
  cjs: js,
  jsx: js,
  ts,
  typescript: ts,
  tsx: ts,
  json,
  jsonc: json,
  json5: prettier("json5", [babel, estree]),
  css,
  scss: prettier("scss", [postcss]),
  less: prettier("less", [postcss]),
  html: prettier("html", [() => import("prettier/plugins/html"), postcss, babel, estree]),
  vue: prettier("vue", [() => import("prettier/plugins/html"), postcss, babel, estree]),
  md: prettier("markdown", [() => import("prettier/plugins/markdown")]),
  markdown: prettier("markdown", [() => import("prettier/plugins/markdown")]),
  yaml: prettier("yaml", [() => import("prettier/plugins/yaml")]),
  yml: prettier("yaml", [() => import("prettier/plugins/yaml")]),
  graphql: prettier("graphql", [() => import("prettier/plugins/graphql")]),
  gql: prettier("graphql", [() => import("prettier/plugins/graphql")]),
  sql,
};

export type FormatResult = { ok: true; code: string } | { ok: false; message: string };

export const canFormat = (lang: string) => lang.trim().split(/\s/)[0].toLowerCase() in FORMATTERS;

export async function formatCode(code: string, lang: string): Promise<FormatResult> {
  const name = lang.trim().split(/\s/)[0].toLowerCase();
  const fmt = FORMATTERS[name];
  if (!fmt) return { ok: false, message: name ? `不支持格式化 ${name}` : "先在 ``` 后写上语言名" };
  try {
    return { ok: true, code: (await fmt(code)).replace(/\n+$/, "") };
  } catch (e) {
    const line = (e as { loc?: { start?: { line?: number } } }).loc?.start?.line;
    return { ok: false, message: line ? `第 ${line} 行语法错误` : "无法格式化" };
  }
}
