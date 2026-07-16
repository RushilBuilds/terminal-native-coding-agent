import { spawn } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
}

/** Stop buffering a process past ~5 MB so a runaway command can't OOM the agent. */
const OUTPUT_CAP = 5_000_000;

/**
 * Spawn a process, capture stdout/stderr (capped), and enforce a wall-clock timeout.
 * Never rejects — failures come back as a non-zero `code` or `timedOut` so callers format
 * them as observations rather than crashing the loop.
 */
export function exec(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs?: number; input?: string },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, opts.timeoutMs)
      : null;

    child.stdout.on("data", (d: Buffer) => {
      if (stdout.length < OUTPUT_CAP) stdout += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < OUTPUT_CAP) stderr += d.toString();
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}${err.message}`, code: null, timedOut });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code, timedOut });
    });

    if (opts.input !== undefined) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}
