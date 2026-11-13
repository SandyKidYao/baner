import { describe, expect, it } from "vitest";
import { formatTime } from "./time";

describe("formatTime", () => {
  const now = new Date(2026, 10, 13, 15, 30).getTime();
  it("今天只显示时分", () => {
    expect(formatTime(new Date(2026, 10, 13, 9, 5).getTime(), now)).toBe("09:05");
  });
  it("今年的其他日子显示月日", () => {
    expect(formatTime(new Date(2026, 10, 12, 23, 59).getTime(), now)).toBe("11-12 23:59");
  });
  it("更早的带年份", () => {
    expect(formatTime(new Date(2025, 0, 2, 8, 0).getTime(), now)).toBe("2025-01-02 08:00");
  });
});
