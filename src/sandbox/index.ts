import type { ExecResult } from "../tools/exec.ts";

/**
 * A sandbox is an isolated place the agent does its work. Tools operate against `root`, so
 * edits and commands never touch the user's real working tree until the diff is applied.
 *
 * The local adapter (git worktree) ships today; a cloud adapter (E2B/Daytona) is a documented
 * drop-in behind this same interface — see docs/adr/0001-sandbox.md.
 */
export interface Sandbox {
  /** Directory tools run against (becomes the ToolContext cwd). */
  readonly root: string;
  /** Run a shell command inside the sandbox. */
  exec(command: string, timeoutMs?: number): Promise<ExecResult>;
  /** Unified diff of everything changed in the sandbox vs its base commit. */
  diff(): Promise<string>;
  /** Apply the sandbox's changes onto the base working tree. Returns a short summary. */
  apply(): Promise<string>;
  /** Throw away the sandbox's changes (reset to the base commit). Returns a short summary. */
  discard(): Promise<string>;
  /** Tear the sandbox down (remove the worktree). */
  dispose(): Promise<void>;
}

/** The subset the TUI needs to review/accept a turn's changes. */
export type SandboxControls = Pick<Sandbox, "diff" | "apply" | "discard">;

export { WorktreeSandbox } from "./worktree.ts";
