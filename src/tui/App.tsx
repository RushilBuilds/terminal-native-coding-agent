import { Box, Text, useApp, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SessionJournal } from "../agent/journal.ts";
import {
  type ActivityEntry,
  type ActivityKind,
  type Budget,
  CancelledError,
  INITIAL_BUDGET,
  type Plan,
  type TurnRunner,
} from "../agent/loop.ts";
import type { SandboxControls } from "../sandbox/index.ts";
import { truncate } from "../tools/truncate.ts";
import { PromptInput } from "./PromptInput.tsx";
import { ActivityPane } from "./panes/ActivityPane.tsx";
import { BudgetPane, type Ceilings } from "./panes/BudgetPane.tsx";
import { PlanPane } from "./panes/PlanPane.tsx";

export interface AppProps {
  modelLabel: string;
  ceilings: Ceilings;
  journal: SessionJournal;
  /** Runs one turn — the real model+MCP loop when configured, else the offline stub. */
  runTurn: TurnRunner;
  /** Sandbox review controls (present when the agent works in an isolated worktree). */
  sandbox?: SandboxControls;
  /** A crashed-and-recovered session to restore on launch, if any. */
  initialSession?: Session | null;
}

/**
 * Root TUI component: the plan / activity / budget split-view plus the prompt.
 *
 * Owns the session lifecycle: each turn opens a journalled session, every plan change is
 * persisted, and completion/exit marks it done. A session recovered from a crash restores
 * its plan on launch (Day 3). The real loop swaps in behind this same interface on Day 4.
 */
export function App({ modelLabel, ceilings, journal, runTurn, sandbox, initialSession }: AppProps) {
  const { exit } = useApp();
  const [text, setText] = useState("");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [plan, setPlan] = useState<Plan>(initialSession?.plan ?? []);
  const [budget, setBudget] = useState<Budget>(INITIAL_BUDGET);
  const [running, setRunning] = useState(false);
  const [resumedFrom, setResumedFrom] = useState<string | null>(initialSession?.id ?? null);

  const nextId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<Session | null>(initialSession ?? null);

  const pushActivity = useCallback((kind: ActivityKind, textLine: string) => {
    setActivity((prev) => [...prev, { id: nextId.current++, kind, text: textLine }]);
  }, []);

  // Surface a one-line note about the restored session.
  useEffect(() => {
    if (initialSession) {
      pushActivity("system", `resumed session ${initialSession.id} — "${initialSession.task}"`);
    }
  }, [initialSession, pushActivity]);

  // Nudge the user to review the worktree after a turn leaves changes behind.
  const reviewIfChanges = useCallback(async () => {
    if (!sandbox) return;
    const d = await sandbox.diff();
    if (d.trim()) {
      pushActivity(
        "system",
        "sandbox has changes — /diff to review · /apply to accept · /discard to drop",
      );
    }
  }, [sandbox, pushActivity]);

  // Handle sandbox review commands typed at the prompt (/diff, /apply, /discard).
  const handleCommand = useCallback(
    (cmd: string) => {
      if (!sandbox) {
        pushActivity("error", "no sandbox active (needs a git repo + configured model).");
        return;
      }
      setRunning(true);
      const run =
        cmd === "/diff"
          ? sandbox
              .diff()
              .then((d) =>
                d.trim() ? truncate(d, { maxChars: 4000 }).text : "no changes in sandbox.",
              )
          : cmd === "/apply"
            ? sandbox.apply()
            : cmd === "/discard"
              ? sandbox.discard()
              : Promise.resolve(`unknown command: ${cmd} (try /diff, /apply, /discard)`);
      run
        .then((out) => {
          pushActivity("system", out);
          if (cmd === "/apply" || cmd === "/discard") setPlan([]);
        })
        .catch((e) => pushActivity("error", e instanceof Error ? e.message : String(e)))
        .finally(() => setRunning(false));
    },
    [sandbox, pushActivity],
  );

  const submit = useCallback(() => {
    const prompt = text.trim();
    if (!prompt || running) return;
    setText("");
    if (prompt.startsWith("/")) {
      handleCommand(prompt);
      return;
    }
    setResumedFrom(null);

    // Close out any recovered session we were just viewing, then open a fresh one.
    if (sessionRef.current?.status === "active") journal.complete(sessionRef.current);
    const session = journal.start(prompt);
    sessionRef.current = session;
    setPlan([]);

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);

    const onPlan = (next: Plan) => {
      setPlan(next);
      if (sessionRef.current)
        sessionRef.current = journal.update(sessionRef.current, { plan: next });
    };

    runTurn(prompt, { onActivity: pushActivity, onPlan }, controller.signal)
      .then(() => setBudget((b) => ({ ...b, turns: b.turns + 1 })))
      .catch((err) => {
        if (err instanceof CancelledError) pushActivity("error", "cancelled.");
        else pushActivity("error", err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (sessionRef.current) sessionRef.current = journal.complete(sessionRef.current);
        setRunning(false);
        abortRef.current = null;
        void reviewIfChanges();
      });
  }, [text, running, pushActivity, journal, runTurn, handleCommand, reviewIfChanges]);

  useInput((input, key) => {
    // Ctrl-C: cancel an in-flight turn, or exit when idle.
    if (key.ctrl && input === "c") {
      if (running && abortRef.current) {
        abortRef.current.abort();
      } else {
        if (sessionRef.current?.status === "active") journal.complete(sessionRef.current);
        exit();
      }
      return;
    }
    // While a turn runs, ignore editing keys (only Ctrl-C above is honored).
    if (running) return;

    if (key.return) {
      submit();
    } else if (key.backspace || key.delete) {
      setText((t) => t.slice(0, -1));
    } else if (key.escape) {
      setText("");
    } else if (input && !key.ctrl && !key.meta) {
      setText((t) => t + input);
    }
  });

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold>terminal-native coding agent</Text>
        {resumedFrom ? (
          <Text color="yellow">⟲ resumed {resumedFrom}</Text>
        ) : (
          <Text dimColor>● {modelLabel}</Text>
        )}
      </Box>

      <Box flexDirection="row" minHeight={14}>
        <Box flexDirection="column" width={36}>
          <Box borderStyle="round" borderColor="gray" flexGrow={1}>
            <PlanPane plan={plan} />
          </Box>
          <Box borderStyle="round" borderColor="gray">
            <BudgetPane budget={budget} ceilings={ceilings} />
          </Box>
        </Box>
        <Box borderStyle="round" borderColor="gray" flexGrow={1}>
          <ActivityPane activity={activity} running={running} />
        </Box>
      </Box>

      <PromptInput text={text} running={running} />
      <Box paddingX={1}>
        <Text dimColor>
          ⏎ submit · ctrl-c {running ? "cancel" : "exit"}
          {sandbox ? " · /diff /apply /discard" : ""}
        </Text>
      </Box>
    </Box>
  );
}
