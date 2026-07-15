import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { App } from "../src/tui/App.tsx";

const CEILINGS = { maxTurns: 50, maxTokens: 200_000, maxUsd: 5 };

/** Small helper: wait a tick so async state updates flush into the next frame. */
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

describe("App (TUI scaffold)", () => {
  test("renders the three panes and their empty states", () => {
    const { lastFrame } = render(<App modelLabel="Test Model" ceilings={CEILINGS} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("PLAN");
    expect(frame).toContain("ACTIVITY");
    expect(frame).toContain("BUDGET");
    expect(frame).toContain("No plan yet");
    expect(frame).toContain("Waiting for a task");
  });

  test("shows the model label and per-task ceilings", () => {
    const { lastFrame } = render(<App modelLabel="Test Model" ceilings={CEILINGS} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Test Model");
    expect(frame).toContain("50"); // max turns
    expect(frame).toContain("200,000"); // max tokens
    expect(frame).toContain("$5.00"); // max spend
  });

  test("echoes a submitted prompt into the activity pane", async () => {
    const { stdin, lastFrame } = render(<App modelLabel="Test Model" ceilings={CEILINGS} />);
    stdin.write("hello world");
    await tick(5);
    expect(lastFrame() ?? "").toContain("hello world");

    stdin.write("\r"); // Enter → submit
    await tick(900); // let the stub turn finish its delayed lines
    const frame = lastFrame() ?? "";
    expect(frame).toContain("hello world"); // user line in the log
    expect(frame).toContain("Day 4"); // stub system line
  });

  test("backspace edits the prompt buffer", async () => {
    const { stdin, lastFrame } = render(<App modelLabel="Test Model" ceilings={CEILINGS} />);
    stdin.write("abc");
    await tick(5);
    stdin.write(""); // DEL / backspace
    await tick(5);
    const frame = lastFrame() ?? "";
    expect(frame).toContain("ab");
    expect(frame).not.toContain("abc");
  });
});
