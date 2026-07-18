import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { type ExecResult, exec } from "../tools/exec.ts";
import type { Sandbox } from "./index.ts";

/** Raised when a worktree sandbox can't be created (e.g. the base isn't a git repo). */
export class SandboxError extends Error {
  override name = "SandboxError";
}

/**
 * Local sandbox backed by a detached `git worktree`.
 *
 * `create` checks out a second working tree at the base repo's HEAD under
 * `.agent/worktrees/<id>` (gitignored). The agent edits and runs commands there; the real
 * working tree is untouched until {@link WorktreeSandbox.apply} lands the diff. Because it
 * starts from HEAD, the sandbox works from a clean, committed base — not the user's dirty state.
 */
export class WorktreeSandbox implements Sandbox {
  private constructor(
    readonly root: string,
    private readonly baseDir: string,
  ) {}

  static async create(baseDir: string): Promise<WorktreeSandbox> {
    const head = await exec("git", ["rev-parse", "HEAD"], { cwd: baseDir });
    if (head.code !== 0) {
      throw new SandboxError(
        `not a git repo with commits at ${baseDir} — cannot create a worktree sandbox`,
      );
    }
    const id = randomUUID().slice(0, 8);
    const root = join(baseDir, ".agent", "worktrees", id);
    await mkdir(join(baseDir, ".agent", "worktrees"), { recursive: true });

    const add = await exec("git", ["worktree", "add", "--detach", "--quiet", root, "HEAD"], {
      cwd: baseDir,
    });
    if (add.code !== 0) {
      throw new SandboxError(`git worktree add failed: ${add.stderr.trim()}`);
    }
    return new WorktreeSandbox(root, baseDir);
  }

  exec(command: string, timeoutMs = 30_000): Promise<ExecResult> {
    return exec("bash", ["-c", command], { cwd: this.root, timeoutMs });
  }

  async diff(): Promise<string> {
    // Intent-to-add so new files show in the diff without staging their content.
    await exec("git", ["add", "-A", "-N"], { cwd: this.root });
    const r = await exec("git", ["diff"], { cwd: this.root });
    return r.stdout;
  }

  async apply(): Promise<string> {
    const patch = await this.diff();
    if (!patch.trim()) return "no changes to apply";
    const r = await exec("git", ["apply", "--whitespace=nowarn", "-"], {
      cwd: this.baseDir,
      input: patch,
    });
    if (r.code !== 0) {
      return `ERROR: could not apply changes to the working tree: ${r.stderr.trim()}`;
    }
    return `applied ${countFiles(patch)} file(s) to the working tree`;
  }

  async discard(): Promise<string> {
    const patch = await this.diff();
    const files = countFiles(patch);
    await exec("git", ["reset", "--hard", "--quiet", "HEAD"], { cwd: this.root });
    await exec("git", ["clean", "-fdq"], { cwd: this.root });
    return files > 0 ? `discarded changes in ${files} file(s)` : "nothing to discard";
  }

  async dispose(): Promise<void> {
    // Best-effort teardown; a leftover worktree is prunable but shouldn't crash exit.
    await exec("git", ["worktree", "remove", "--force", this.root], { cwd: this.baseDir });
  }
}

/** Count files touched in a unified diff (one `diff --git` header per file). */
function countFiles(patch: string): number {
  return (patch.match(/^diff --git/gm) ?? []).length;
}
