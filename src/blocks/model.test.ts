import { describe, expect, it } from "vitest";
import { diff, isValidDoc, keyBetween, MARK, newBlock, parse, serialize } from "./model";

const B = (id: string, key: string, text: string) => ({ id, key, text });

describe("serialize / parse", () => {
  it("往返不丢内容,包括空块和结尾换行", () => {
    const blocks = [B("aa", "a0", "first\nline"), B("bb", "a1", ""), B("cc", "a2", "last\n")];
    expect(parse(serialize(blocks))).toEqual(blocks);
  });
  it("分隔行以控制字符开头", () => {
    expect(serialize([B("aa", "a0", "x")]).startsWith(MARK)).toBe(true);
  });
});

describe("isValidDoc", () => {
  it("接受正常文档", () => {
    expect(isValidDoc(serialize([B("aa", "a0", "x"), B("bb", "a1", "y")]))).toBe(true);
  });
  it("拒绝不以分隔行开头的文档", () => {
    expect(isValidDoc(`x\n${serialize([B("aa", "a0", "")])}`)).toBe(false);
  });
  it("拒绝分隔行被并入正文", () => {
    const doc = serialize([B("aa", "a0", "x"), B("bb", "a1", "y")]).replace(`x\n${MARK}`, `x${MARK}`);
    expect(isValidDoc(doc)).toBe(false);
  });
  it("拒绝以分隔行结尾(块没有正文行)", () => {
    expect(isValidDoc(`${MARK}a0~aa`)).toBe(false);
  });
  it("拒绝重复的块 id", () => {
    expect(isValidDoc(serialize([B("aa", "a0", "x"), B("aa", "a1", "y")]))).toBe(false);
  });
});

describe("排序键", () => {
  it("在两块之间插入时,新键位于两者之间", () => {
    const k = keyBetween("a0", "a1");
    expect(k > "a0" && k < "a1").toBe(true);
    const nb = newBlock("a0", null);
    expect(nb.key > "a0").toBe(true);
    expect(nb.id).toMatch(/^[0-9a-z]+$/);
  });
});

describe("diff", () => {
  const saved = new Map([
    ["aa", B("aa", "a0", "x")],
    ["bb", B("bb", "a1", "y")],
  ]);
  it("只写入改动过的块,删除消失的块", () => {
    const d = diff(saved, [B("aa", "a0", "x2")]);
    expect(d.upserts).toEqual([B("aa", "a0", "x2")]);
    expect(d.deletes).toEqual([B("bb", "a1", "y")]);
  });
  it("空的新块暂不落盘", () => {
    expect(diff(saved, [...saved.values(), B("cc", "a2", "")]).upserts).toEqual([]);
  });
});
