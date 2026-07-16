import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  editFileTool,
  gitTool,
  readFileTool,
  runCommandTool,
  searchCodeTool,
  symbolsTool,
} from "../src/tools/index.ts";

let dir: string;
let ctx: { cwd: string };

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tnca-tools-"));
  ctx = { cwd: dir };
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("read_file", () => {
  test("returns line-numbered content and honors offset/limit", async () => {
    writeFileSync(join(dir, "f.txt"), "a\nb\nc\nd");
    expect(await readFileTool.execute({ path: "f.txt" }, ctx)).toContain("1  a");
    const slice = await readFileTool.execute({ path: "f.txt", offset: 2, limit: 2 }, ctx);
    expect(slice).toContain("2  b");
    expect(slice).toContain("3  c");
    expect(slice).not.toContain("d");
  });

  test("errors on a missing file and on path escape", async () => {
    expect(await readFileTool.execute({ path: "nope.txt" }, ctx)).toStartWith("ERROR");
    expect(await readFileTool.execute({ path: "../../etc/passwd" }, ctx)).toStartWith("ERROR");
  });
});

describe("edit_file", () => {
  test("creates a file when old_string is empty", async () => {
    const msg = await editFileTool.execute({ path: "new.txt", new_string: "hi" }, ctx);
    expect(msg).toContain("Wrote");
    expect(await readFile(join(dir, "new.txt"), "utf8")).toBe("hi");
  });

  test("replaces a unique string, and rejects ambiguous/absent matches", async () => {
    writeFileSync(join(dir, "e.txt"), "one two one");
    expect(
      await editFileTool.execute({ path: "e.txt", old_string: "zzz", new_string: "x" }, ctx),
    ).toContain("not found");
    expect(
      await editFileTool.execute({ path: "e.txt", old_string: "one", new_string: "x" }, ctx),
    ).toContain("matches 2 times");
    await editFileTool.execute({ path: "e.txt", old_string: "two", new_string: "TWO" }, ctx);
    expect(await readFile(join(dir, "e.txt"), "utf8")).toBe("one TWO one");
  });
});

describe("search_code", () => {
  test("finds matches and reports none cleanly", async () => {
    writeFileSync(join(dir, "a.ts"), "const needle = 1;\nconst hay = 2;");
    const hit = await searchCodeTool.execute({ pattern: "needle" }, ctx);
    expect(hit).toContain("a.ts");
    expect(hit).toContain("needle");
    expect(await searchCodeTool.execute({ pattern: "zzz_nomatch_zzz" }, ctx)).toBe("No matches.");
  });
});

describe("symbols", () => {
  test("lists declarations from a TypeScript file via tree-sitter", async () => {
    writeFileSync(
      join(dir, "m.ts"),
      "export function foo() {}\nexport class Bar {\n  baz() {}\n}\n",
    );
    const out = await symbolsTool.execute({ path: "m.ts" }, ctx);
    expect(out).toContain("function foo");
    expect(out).toContain("class Bar");
    expect(out).toContain("baz"); // nested method
  });

  test("errors for an unsupported extension", async () => {
    writeFileSync(join(dir, "x.unknownext"), "data");
    expect(await symbolsTool.execute({ path: "x.unknownext" }, ctx)).toStartWith("ERROR");
  });
});

describe("run_command", () => {
  test("captures stdout/stderr and exit code", async () => {
    const out = await runCommandTool.execute({ command: "echo hi && echo boom >&2" }, ctx);
    expect(out).toContain("hi");
    expect(out).toContain("boom");
    expect(out).toContain("[exit 0]");
  });
});

describe("git", () => {
  test("rejects subcommands outside the allowlist", async () => {
    expect(await gitTool.execute({ args: ["push", "origin", "main"] }, ctx)).toContain(
      "not allowed",
    );
  });

  test("runs an allowed subcommand", async () => {
    await runCommandTool.execute({ command: "git init -q" }, ctx);
    const out = await gitTool.execute({ args: ["status", "--short"] }, ctx);
    expect(out).toContain("[exit 0]");
  });
});
