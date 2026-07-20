import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditLog } from "../src/hooks/builtins/audit-log.ts";
import { dangerousCommands } from "../src/hooks/builtins/dangerous-commands.ts";
import { protectRemote } from "../src/hooks/builtins/protect-remote.ts";
import { protectSensitiveFiles } from "../src/hooks/builtins/protect-sensitive-files.ts";
import { redactSecrets } from "../src/hooks/builtins/redact-secrets.ts";
import { HookEngine } from "../src/hooks/engine.ts";

describe("dangerous-commands", () => {
  test("denies destructive shell, allows normal shell", async () => {
    const deny = await dangerousCommands.preToolUse?.({
      tool: "run_command",
      args: { command: "rm -rf /" },
    });
    expect(deny).toEqual({ action: "deny", reason: expect.stringContaining("force-remove") });
    expect(
      await dangerousCommands.preToolUse?.({ tool: "run_command", args: { command: "ls -la" } }),
    ).toBeUndefined();
  });

  test("catches sudo and fork bombs", async () => {
    for (const command of ["sudo rm x", ":(){ :|:& };:"]) {
      const d = await dangerousCommands.preToolUse?.({ tool: "run_command", args: { command } });
      expect(d?.action).toBe("deny");
    }
  });
});

describe("protect-remote", () => {
  test("blocks git push via the git tool and via the shell", async () => {
    expect(
      (await protectRemote.preToolUse?.({ tool: "git", args: { args: ["push", "origin"] } }))
        ?.action,
    ).toBe("deny");
    expect(
      (await protectRemote.preToolUse?.({ tool: "run_command", args: { command: "git push -f" } }))
        ?.action,
    ).toBe("deny");
    expect(
      await protectRemote.preToolUse?.({ tool: "git", args: { args: ["status"] } }),
    ).toBeUndefined();
  });
});

describe("protect-sensitive-files", () => {
  test("blocks edits to secrets, allows normal files", async () => {
    for (const path of [".env", "config/.env.local", ".git/config", "deploy.pem", ".ssh/id_rsa"]) {
      const d = await protectSensitiveFiles.preToolUse?.({ tool: "edit_file", args: { path } });
      expect(d?.action).toBe("deny");
    }
    expect(
      await protectSensitiveFiles.preToolUse?.({ tool: "edit_file", args: { path: "src/app.ts" } }),
    ).toBeUndefined();
  });
});

describe("redact-secrets", () => {
  test("redacts keys and key=value secrets, leaves clean text alone", async () => {
    const out = await redactSecrets.postToolUse?.({
      tool: "read_file",
      args: {},
      result: "key=sk-abcdefghijklmnopqrstuvwxyz012345\npassword: hunter2secret\nhello world",
    });
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(out).not.toContain("hunter2secret");
    expect(out).toContain("hello world");
    expect(
      await redactSecrets.postToolUse?.({ tool: "read_file", args: {}, result: "nothing secret" }),
    ).toBeUndefined();
  });
});

describe("HookEngine", () => {
  test("first deny short-circuits PreToolUse", async () => {
    const engine = new HookEngine([dangerousCommands, protectRemote]);
    const outcome = await engine.preToolUse("run_command", { command: "sudo reboot" });
    expect(outcome.blocked?.hook).toBe("dangerous-commands");
  });

  test("PostToolUse transforms chain", async () => {
    const engine = new HookEngine([redactSecrets]);
    const out = await engine.postToolUse("read_file", {}, "token: supersecretvalue");
    expect(out).toContain("[REDACTED]");
  });
});

describe("audit-log", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tnca-audit-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("appends session + tool events to the log file", async () => {
    const path = join(dir, "audit.log");
    const hook = auditLog(path);
    await hook.sessionStart?.({ task: "do a thing" });
    await hook.postToolUse?.({ tool: "read_file", args: {}, result: "abc" });
    await hook.sessionEnd?.({});
    const log = readFileSync(path, "utf8");
    expect(log).toContain("session-start");
    expect(log).toContain("tool=read_file result_chars=3");
    expect(log).toContain("session-end");
  });
});
