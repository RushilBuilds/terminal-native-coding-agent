import type { ExecResult } from "../tools/exec.ts";
import type { Sandbox } from "./index.ts";
import { SandboxError } from "./worktree.ts";

/**
 * Cloud sandbox adapter (E2B / Daytona) — documented drop-in, not yet implemented.
 *
 * The whole point of the {@link Sandbox} interface is that a cloud backend slots in behind it
 * without the agent loop or tools changing. This stub records the shape and fails loudly until
 * someone wires an account/API key. See docs/adr/0001-sandbox.md for the plan.
 */
export class CloudSandbox implements Sandbox {
  readonly root = "/workspace";

  static async create(): Promise<CloudSandbox> {
    throw new SandboxError(
      "cloud sandbox (E2B/Daytona) is not implemented yet — see docs/adr/0001-sandbox.md. " +
        "Use the default git-worktree sandbox for now.",
    );
  }

  exec(): Promise<ExecResult> {
    return Promise.reject(new SandboxError("cloud sandbox not implemented"));
  }
  diff(): Promise<string> {
    return Promise.reject(new SandboxError("cloud sandbox not implemented"));
  }
  apply(): Promise<string> {
    return Promise.reject(new SandboxError("cloud sandbox not implemented"));
  }
  discard(): Promise<string> {
    return Promise.reject(new SandboxError("cloud sandbox not implemented"));
  }
  dispose(): Promise<void> {
    return Promise.resolve();
  }
}
