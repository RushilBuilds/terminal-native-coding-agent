import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionJournal } from "../src/agent/journal.ts";
import { createPlan, withStatus } from "../src/agent/plan.ts";

let dir: string;
let journal: SessionJournal;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tnca-journal-"));
  journal = new SessionJournal(dir);
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("SessionJournal", () => {
  test("start writes an active, empty-plan session", () => {
    const s = journal.start("do a thing");
    expect(s.status).toBe("active");
    expect(s.task).toBe("do a thing");
    expect(s.plan).toEqual([]);
  });

  test("update persists the plan and bumps updatedAt", () => {
    const s = journal.start("task");
    const plan = withStatus(createPlan(["step one", "step two"]), 1, "done");
    const updated = journal.update(s, { plan });
    expect(updated.plan).toEqual(plan);
    // A fresh journal over the same dir sees the persisted plan.
    expect(new SessionJournal(dir).latestResumable()?.plan).toEqual(plan);
  });

  test("latestResumable returns an active session, then null once completed", () => {
    const s = journal.start("resume me");
    expect(journal.latestResumable()?.id).toBe(s.id);
    journal.complete(s);
    expect(journal.latestResumable()).toBeNull();
  });

  test("picks the most recently updated active session", async () => {
    const a = journal.start("older");
    await new Promise((r) => setTimeout(r, 5));
    const b = journal.start("newer");
    journal.update(b, { plan: createPlan(["x"]) });
    expect(journal.latestResumable()?.id).toBe(b.id);
    expect(journal.latestResumable()?.task).toBe("newer");
    expect(a.id).not.toBe(b.id);
  });

  test("ignores corrupt journal files", () => {
    writeFileSync(join(dir, "session-broken.json"), "{ not valid json");
    expect(journal.latestResumable()).toBeNull();
    const s = journal.start("ok");
    expect(journal.latestResumable()?.id).toBe(s.id); // still finds the good one
  });
});
