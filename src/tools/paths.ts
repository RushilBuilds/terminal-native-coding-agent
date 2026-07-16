import { isAbsolute, relative, resolve } from "node:path";

/** Raised when a tool is asked to touch a path outside its working directory. */
export class PathEscapeError extends Error {
  override name = "PathEscapeError";
}

/**
 * Resolve `p` against `cwd` and refuse anything that escapes it. This is the tools' baseline
 * containment (richer policy — worktrees, hooks — arrives on Days 5–6); it stops the obvious
 * `../../etc/passwd` foot-gun today.
 */
export function resolveInside(cwd: string, p: string): string {
  const root = resolve(cwd);
  const full = isAbsolute(p) ? resolve(p) : resolve(root, p);
  const rel = relative(root, full);
  if (rel === "") return full;
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new PathEscapeError(`path "${p}" resolves outside the working directory`);
  }
  return full;
}
