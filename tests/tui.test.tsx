import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { SessionJournal } from "../src/agent/journal.ts";
import { runStubTurn } from "../src/agent/loop.ts";
import { createPlan } from "../src/agent/plan.ts";
import { App } from "../src/tui/App.tsx";

const CEILINGS = { maxTurns: 50, maxTokens: 200_000, maxUsd: 5 };

/** Small helper: wait a tick so async state updates flush into the next frame. */
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

let dir: string;
let journal: SessionJournal;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tnca-tui-"));
  journal = new SessionJournal(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("App (TUI scaffold)", () => {
  test("renders the three panes and their empty states", () => {
    const { lastFrame } = render(
      <App modelLabel="Test Model" ceilings={CEILINGS} journal={journal} runTurn={runStubTurn} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("PLAN");
    expect(frame).toContain("ACTIVITY");
    expect(frame).toContain("BUDGET");
    expect(frame).toContain("No plan yet");
    expect(frame).toContain("Waiting for a task");
  });

  test("shows the model label and per-task ceilings", () => {
    const { lastFrame } = render(
      <App modelLabel="Test Model" ceilings={CEILINGS} journal={journal} runTurn={runStubTurn} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Test Model");
    expect(frame).toContain("50"); // max turns
    expect(frame).toContain("200,000"); // max tokens
    expect(frame).toContain("$5.00"); // max spend
  });

  test("echoes a submitted prompt and walks the plan to completion", async () => {
    const { stdin, lastFrame } = render(
      <App modelLabel="Test Model" ceilings={CEILINGS} journal={journal} runTurn={runStubTurn} />,
    );
    stdin.write("hello world");
    await tick(5);
    expect(lastFrame() ?? "").toContain("hello world");

    stdin.write("\r"); // Enter → submit
    await tick(1200); // let the stub turn finish walking the plan
    const frame = lastFrame() ?? "";
    expect(frame).toContain("hello world"); // user line in the log
    expect(frame).toContain("offline stub"); // stub system line
    expect(frame).toContain("4/4"); // plan progress: all steps done
    // The session was journalled and completed (no longer resumable).
    expect(new SessionJournal(dir).latestResumable()).toBeNull();
  });

  test("restores a recovered session's plan on launch", async () => {
    const crashed = journal.start("half-finished task");
    journal.update(crashed, { plan: createPlan(["step A", "step B"]) });

    const initialSession = journal.latestResumable();
    const { lastFrame } = render(
      <App
        modelLabel="Test Model"
        ceilings={CEILINGS}
        journal={journal}
        runTurn={runStubTurn}
        initialSession={initialSession}
      />,
    );
    await tick(10);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("step A"); // restored plan rendered
    expect(frame).toContain("step B");
    expect(frame).toContain("resumed"); // banner + activity note
    expect(frame).toContain(crashed.id);
  });

  test("routes /apply to the sandbox and shows the result", async () => {
    const calls: string[] = [];
    const sandbox = {
      diff: async () => "diff --git a/x b/x",
      apply: async () => {
        calls.push("apply");
        return "applied 1 file(s) to the working tree";
      },
      discard: async () => "discarded",
    };
    const { stdin, lastFrame } = render(
      <App
        modelLabel="Test Model"
        ceilings={CEILINGS}
        journal={journal}
        runTurn={runStubTurn}
        sandbox={sandbox}
      />,
    );
    stdin.write("/apply");
    await tick(5);
    stdin.write("\r");
    await tick(20);
    expect(calls).toEqual(["apply"]);
    expect(lastFrame() ?? "").toContain("applied 1 file(s)");
  });

  test("nudges to review when a turn leaves sandbox changes", async () => {
    const sandbox = {
      diff: async () => "diff --git a/x b/x\n+change",
      apply: async () => "applied",
      discard: async () => "discarded",
    };
    const { stdin, lastFrame } = render(
      <App
        modelLabel="Test Model"
        ceilings={CEILINGS}
        journal={journal}
        runTurn={runStubTurn}
        sandbox={sandbox}
      />,
    );
    stdin.write("do something");
    await tick(5);
    stdin.write("\r");
    await tick(1200);
    expect(lastFrame() ?? "").toContain("sandbox has changes");
  });

  test("backspace edits the prompt buffer", async () => {
    const { stdin, lastFrame } = render(
      <App modelLabel="Test Model" ceilings={CEILINGS} journal={journal} runTurn={runStubTurn} />,
    );
    stdin.write("abc");
    await tick(5);
    stdin.write(""); // DEL → backspace
    await tick(5);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("ab");
    expect(frame).not.toContain("abc");
  });
});
