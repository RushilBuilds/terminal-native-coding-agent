import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxError, WorktreeSandbox } from "../src/sandbox/worktree.ts";
import { exec } from "../src/tools/exec.ts";

let base: string;

async function git(args: string[], cwd = base) {
  const r = await exec("git", args, { cwd });
  if (r.code !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
}

beforeEach(async () => {
  base = mkdtempSync(join(tmpdir(), "tnca-sbx-"));
  await git(["init", "-q"]);
  await git(["config", "user.email", "t@t.co"]);
  await git(["config", "user.name", "t"]);
  writeFileSync(join(base, "app.ts"), "export const x = 1;\n");
  await git(["add", "-A"]);
  await git(["commit", "-qm", "init"]);
});
afterEach(() => rmSync(base, { recursive: true, force: true }));

describe("WorktreeSandbox", () => {
  test("create fails outside a git repo", async () => {
    const notRepo = mkdtempSync(join(tmpdir(), "tnca-norepo-"));
    await expect(WorktreeSandbox.create(notRepo)).rejects.toBeInstanceOf(SandboxError);
    rmSync(notRepo, { recursive: true, force: true });
  });

  test("edits happen in the worktree, leaving the base tree untouched", async () => {
    const sbx = await WorktreeSandbox.create(base);
    await sbx.exec("echo 'export const y = 2;' >> app.ts && echo 'new' > added.txt");

    // Sandbox sees the changes...
    const diff = await sbx.diff();
    expect(diff).toContain("app.ts");
    expect(diff).toContain("added.txt");

    // ...but the base working tree does NOT, until we apply.
    expect(readFileSync(join(base, "app.ts"), "utf8")).toBe("export const x = 1;\n");
    expect(existsSync(join(base, "added.txt"))).toBe(false);

    await sbx.dispose();
  });

  test("apply lands the sandbox changes on the base working tree", async () => {
    const sbx = await WorktreeSandbox.create(base);
    await sbx.exec("printf 'export const y = 2;\\n' >> app.ts && printf 'hi\\n' > added.txt");

    const summary = await sbx.apply();
    expect(summary).toContain("file(s) to the working tree");
    expect(readFileSync(join(base, "app.ts"), "utf8")).toContain("export const y = 2;");
    expect(readFileSync(join(base, "added.txt"), "utf8")).toBe("hi\n");

    await sbx.dispose();
  });

  test("discard throws away sandbox changes", async () => {
    const sbx = await WorktreeSandbox.create(base);
    await sbx.exec("echo junk > junk.txt && echo more >> app.ts");
    expect(await sbx.diff()).not.toBe("");

    const summary = await sbx.discard();
    expect(summary).toContain("discarded");
    expect(await sbx.diff()).toBe("");
    expect(existsSync(join(base, "junk.txt"))).toBe(false); // base never saw it

    await sbx.dispose();
  });

  test("dispose removes the worktree", async () => {
    const sbx = await WorktreeSandbox.create(base);
    expect(existsSync(sbx.root)).toBe(true);
    await sbx.dispose();
    expect(existsSync(sbx.root)).toBe(false);
  });
});
