import { describe, expect, test } from "bun:test";
import { truncate } from "../src/tools/truncate.ts";

describe("truncate", () => {
  test("passes through content within the budget", () => {
    const r = truncate("hello world");
    expect(r.truncated).toBe(false);
    expect(r.text).toBe("hello world");
  });

  test("keeps head and tail when many lines overflow", () => {
    const text = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
    const r = truncate(text, { maxChars: 2000, headLines: 10, tailLines: 5 });
    expect(r.truncated).toBe(true);
    expect(r.text).toContain("line 0"); // head kept
    expect(r.text).toContain("line 4999"); // tail kept
    expect(r.text).toContain("truncated");
    expect(r.text.length).toBeLessThanOrEqual(2000);
  });

  test("falls back to char slicing for a giant single line", () => {
    const text = "x".repeat(100_000);
    const r = truncate(text, { maxChars: 1000 });
    expect(r.truncated).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(1000);
    expect(r.text).toContain("truncated");
    expect(r.originalChars).toBe(100_000);
  });
});
